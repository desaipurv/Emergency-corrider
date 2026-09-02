import asyncio
import json
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.api.endpoints import router as api_router, get_simulation_state
from app.core.simulation import simulation_state

class WebSocketConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        # Broadcast safely
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(data))
            except Exception:
                disconnected.append(connection)
        for dead_conn in disconnected:
            self.disconnect(dead_conn)

ws_manager = WebSocketConnectionManager()

async def background_simulation_loop():
    last_t = time.time()
    while True:
        try:
            curr_t = time.time()
            dt = curr_t - last_t
            last_t = curr_t

            # Tick simulation physics & state machine
            simulation_state.update_simulation_tick(dt)

            # Broadcast state if there are active WebSocket connections
            if ws_manager.active_connections:
                payload = {
                    "type": "TELEMETRY_TICK",
                    "timestamp": curr_t,
                    "state": get_simulation_state()
                }
                await ws_manager.broadcast(payload)

            await asyncio.sleep(0.2)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"Error in background simulation loop: {e}")
            await asyncio.sleep(1.0)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    sim_task = asyncio.create_task(background_simulation_loop())
    yield
    # Shutdown
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title="Emergency Mobility Corridor Backend API",
    description="Dynamic Emergency Mobility Corridor — Multi-Agency Green Corridor & Emergency Route Platform. TRAFFIC SIMULATION environment.",
    version="1.0.0",
    lifespan=lifespan
)

# DEVELOPMENT-ONLY CORS configuration for the hackathon prototype.
# The known frontend origin is configured explicitly. Since credentials are used
# with WebSocket telemetry, wildcard is NOT used with credentials.
# NOTE: This is a development/hackathon configuration, NOT production-safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        # Send initial snapshot immediately
        await websocket.send_text(json.dumps({
            "type": "INITIAL_SNAPSHOT",
            "timestamp": time.time(),
            "state": get_simulation_state()
        }))
        while True:
            # Keep receiving client pings/messages
            data = await websocket.receive_text()
            # If client sends command via WS
            try:
                cmd = json.loads(data)
                if cmd.get("action") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG", "timestamp": time.time()}))
            except Exception:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

@app.get("/")
def root():
    return {
        "project": "Emergency Mobility Corridor API",
        "tagline": "From Patient to Hospital — A Smarter Emergency Route",
        "status": "OPERATIONAL",
        "version": "1.0.0",
        "active_corridors": len([v for v in simulation_state.vehicles.values() if v.green_corridor_active])
    }
