import time
from typing import Dict, List, Optional, Any
from app.models.schemas import Responder, ResponderLevel, EmergencyVehicle, Patient

class ResponderNetworkEngine:
    """
    Opt-in Privacy-Preserving First Responder & Volunteer Dispatch
    Core Philosophy: 'Notify, Don't Track.'
    """

    @classmethod
    def evaluate_first_responder_dispatch(
        cls,
        patient: Patient,
        ambulance: EmergencyVehicle,
        responders: Dict[str, Responder],
        max_responders: int = 3
    ) -> List[Dict[str, Any]]:
        from app.core.simulation import haversine_distance_meters

        eligible = []
        for r_id, resp in responders.items():
            if not resp.opt_in or resp.status != "IDLE":
                continue

            dist_m = haversine_distance_meters(resp.lat, resp.lng, patient.lat, patient.lng)

            if dist_m <= 1500.0:
                resp_speed_mps = 6.0
                resp_eta_sec = dist_m / resp_speed_mps

                level_rank = {
                    ResponderLevel.LEVEL_3_VERIFIED_MEDICAL_PRO: 3,
                    ResponderLevel.LEVEL_2_TRAINED_FIRST_RESPONDER: 2,
                    ResponderLevel.LEVEL_1_COMMUNITY_VOLUNTEER: 1,
                }.get(resp.level, 0)

                eligible.append({
                    "responder_id": resp.id,
                    "responder_level": resp.level.value,
                    "level_rank": level_rank,
                    "eta_sec": resp_eta_sec,
                    "dist_m": dist_m,
                })

        eligible.sort(key=lambda x: (-x["level_rank"], x["eta_sec"]))

        notified = eligible[:max_responders]
        created_ts = time.time()
        result_alerts = []

        for i, entry in enumerate(notified):
            resp = responders[entry["responder_id"]]
            alert_payload = {
                "alert_id": f"RESP-ALT-{int(created_ts*1000)}-{resp.id}",
                "responder_id": resp.id,
                "patient_approx_dist_m": round(entry["dist_m"], 0),
                "patient_approx_area": "Defence Colony Sector 3 (Approx 400m radius)",
                "ambulance_eta_sec": int(ambulance.eta_seconds),
                "responder_eta_sec": int(entry["eta_sec"]),
                "responder_level": resp.level.value,
                "action_required": "Provide first-aid stabilization & clear ambulance gateway",
                "safety_rule": "Ambulance response continues uninterrupted. Volunteers cannot cancel ambulance.",
                "expires_in_sec": 300,
                "expires_at": created_ts + 300,
                "alert_created_at": created_ts,
                "assignment_rank": i + 1,
                "max_assignments": len(notified),
            }

            resp.active_alert = alert_payload
            resp.status = "ALERTED"
            resp.alert_created_at = created_ts
            result_alerts.append(alert_payload)

        return result_alerts

    @classmethod
    def accept_alert(cls, resp: Responder) -> Dict[str, Any]:
        accepted_ts = time.time()
        created_at = resp.alert_created_at or accepted_ts

        response_time = accepted_ts - created_at

        resp.status = "ACCEPTED"
        resp.responder_accepted_time = accepted_ts

        if resp.active_alert:
            resp.active_alert = {**resp.active_alert, "accepted_at": accepted_ts, "response_time_sec": round(response_time, 2)}

        return {
            "responder_id": resp.id,
            "accepted_at": accepted_ts,
            "alert_created_at": created_at,
            "response_time_sec": round(response_time, 2),
        }


responder_network = ResponderNetworkEngine()
