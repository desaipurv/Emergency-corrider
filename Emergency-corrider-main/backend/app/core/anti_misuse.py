import time
from typing import Dict, List, Optional, Tuple, Any
from app.models.schemas import AntiMisuseAuditEntry, VehicleType, EmergencyVehicle, RiskStatus

KNOWN_ER_REFERENCES: Dict[str, Dict[str, Any]] = {
    "ER-7F29A": {
        "hospital": "HOSP-01",
        "hospital_name": "Delhi Trauma Center - DEMO",
        "valid_from": "00:00",
        "valid_until": "23:59",
        "verified": "true",
        "verification_created_at": "2026-09-01 08:00:00",
        "verification_expiry": "2026-09-01 20:00:00",
        "vehicle_id": "DL-01-AB-1234",
        "destination": "HOSP-01",
        "status": "VERIFIED",
    },
    "ER-99X10": {
        "hospital": "HOSP-02",
        "hospital_name": "City Emergency Hospital - SIMULATION",
        "valid_from": "00:00",
        "valid_until": "23:59",
        "verified": "true",
        "verification_created_at": "2026-09-01 10:00:00",
        "verification_expiry": "2026-09-01 22:00:00",
        "vehicle_id": "DL-02-EX-7788",
        "destination": "HOSP-02",
        "status": "VERIFIED",
    },
    "ER-DEMO-2026": {
        "hospital": "HOSP-01",
        "hospital_name": "Delhi Trauma Center - DEMO",
        "valid_from": "00:00",
        "valid_until": "23:59",
        "verified": "true",
        "verification_created_at": "2026-09-01 00:00:00",
        "verification_expiry": "2026-12-31 23:59:00",
        "vehicle_id": "DEMO-001",
        "destination": "HOSP-01",
        "status": "VERIFIED",
    },
    "ER-EXPIRED": {
        "hospital": "HOSP-01",
        "hospital_name": "Delhi Trauma Center - DEMO",
        "valid_from": "2026-01-01 00:00",
        "valid_until": "2026-01-02 00:00",
        "verified": "true",
        "verification_created_at": "2026-01-01 00:00:00",
        "verification_expiry": "2026-01-02 00:00:00",
        "vehicle_id": "EXP-001",
        "destination": "HOSP-01",
        "status": "EXPIRED",
    },
}

KNOWN_HOSPITAL_IDS = {"HOSP-01", "HOSP-02"}

VERIFICATION_LABEL = "[SIMULATED HOSPITAL / DISPATCH VERIFICATION - Not a real hospital system]"


def _parse_hhmm(time_str: str) -> int:
    """Convert HH:MM to minutes since midnight."""
    try:
        parts = time_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, IndexError):
        return 0


class AntiMisuseAuditEngine:
    """
    Anti-Misuse, Verification & Governance Engine.
    All checks are fully DETERMINISTIC - decisions never rely on stochastic sampling.
    """

    @classmethod
    def verify_er_reference(cls, er_code: Optional[str]) -> Tuple[bool, str]:
        if not er_code:
            return False, f"UNVERIFIED: No ER Reference Code provided. Limited priority granted. {VERIFICATION_LABEL}"

        cleaned = er_code.strip().upper()
        record = KNOWN_ER_REFERENCES.get(cleaned)

        if record:
            if record.get("status") == "EXPIRED":
                expiry = record.get("verification_expiry", "unknown")
                return False, (
                    f"REJECTED: Dispatch token ({cleaned}) is EXPIRED (was valid until {expiry}). "
                    f"Priority NOT granted. {VERIFICATION_LABEL}"
                )

            now_t = time.localtime(time.time())
            now_min = now_t.tm_hour * 60 + now_t.tm_min
            valid_from = _parse_hhmm(record.get("valid_from", "00:00"))
            valid_until = _parse_hhmm(record.get("valid_until", "23:59"))

            if now_min < valid_from or now_min > valid_until:
                return False, (
                    f"REJECTED: Dispatch token ({cleaned}) is currently OUTSIDE its validity window "
                    f"({record['valid_from']}-{record['valid_until']}). {VERIFICATION_LABEL}"
                )

            return True, (
                f"VERIFIED: Hospital Dispatch Token ({cleaned}) issued by {record['hospital_name']}. "
                f"Valid {record['valid_from']}-{record['valid_until']}. Status: {record.get('status', 'VERIFIED')}. "
                f"Expiry: {record.get('verification_expiry', 'n/a')}. {VERIFICATION_LABEL}"
            )

        return False, (
            f"UNVERIFIED: '{cleaned}' is not a recognised hospital dispatch token. "
            f"Limited emergency priority granted (Tier 3 only). {VERIFICATION_LABEL}"
        )

    @classmethod
    def calculate_risk_score(cls, vehicle: EmergencyVehicle) -> Tuple[int, List[str]]:
        score = 0
        reasons: List[str] = []

        if not vehicle.is_verified:
            score += 30
            reasons.append("No verified hospital dispatch token provided.")

        if vehicle.vehicle_type == VehicleType.PRIVATE_UNVERIFIED:
            score += 20
            reasons.append("Vehicle type is PRIVATE_UNVERIFIED - no institutional verification.")

        duration_sec = time.time() - (vehicle.start_time or time.time())
        if 0 < duration_sec < 120:
            score += 15
            reasons.append(f"Unusually short journey duration ({int(duration_sec)}s) - possible flash misuse.")

        if vehicle.speed_kmh < 8.0 and vehicle.phase.value not in ("IDLE", "PATIENT_ONBOARD", "COMPLETED"):
            score += 15
            reasons.append(f"Very low speed ({vehicle.speed_kmh} km/h) for an active emergency vehicle.")

        if vehicle.vehicle_type == VehicleType.AMBULANCE and not vehicle.patient_id:
            score += 10
            reasons.append("Ambulance has no patient ID assigned.")

        if vehicle.hospital_id and vehicle.hospital_id not in KNOWN_HOSPITAL_IDS:
            score += 10
            reasons.append(f"Declared destination hospital '{vehicle.hospital_id}' not in registered trauma network.")

        current_pos = (vehicle.lat, vehicle.lng)
        if vehicle.route_coords:
            first = vehicle.route_coords[0]
            dist_from_start = haversine_dist(current_pos[0], current_pos[1], first.lat, first.lng)
            if dist_from_start < 50.0:
                score += 5
                reasons.append("Vehicle has not moved significantly from mission start.")

        return min(score, 100), reasons

    @classmethod
    def risk_category(cls, score: int) -> str:
        if score <= 20:
            return RiskStatus.NORMAL.value
        elif score <= 50:
            return RiskStatus.REVIEW.value
        elif score <= 75:
            return RiskStatus.FLAGGED.value
        else:
            return RiskStatus.SUSPENDED.value

    @classmethod
    def is_suspicious(cls, score: int) -> bool:
        return score > 20

    @classmethod
    def audit_completed_journey(cls, vehicle: EmergencyVehicle) -> AntiMisuseAuditEntry:
        duration_min = round((time.time() - (vehicle.start_time or time.time())) / 60.0, 1)
        distance_km = max(0.5, round(len(vehicle.signals_passed) * 0.6 + vehicle.route_progress_pct / 100.0 * 2.1, 2))
        avg_speed = round(vehicle.speed_kmh, 1)

        risk_score, reasons = cls.calculate_risk_score(vehicle)
        is_suspicious = cls.is_suspicious(risk_score)
        category = cls.risk_category(risk_score)
        status = "COMPLETED" if category == RiskStatus.NORMAL.value else category

        entry = AntiMisuseAuditEntry(
            session_id=vehicle.session_id or "EMC-SES-UNKNOWN",
            vehicle_id=vehicle.id,
            vehicle_number=vehicle.vehicle_number,
            vehicle_type=vehicle.vehicle_type.value,
            severity=vehicle.severity.value,
            start_time=time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(vehicle.start_time or time.time())),
            duration_minutes=max(0.1, duration_min),
            distance_km=distance_km,
            avg_speed_kmh=avg_speed,
            verified=vehicle.is_verified,
            risk_score=risk_score,
            risk_category=category,
            suspicious_flag=is_suspicious,
            suspicious_reasons=reasons,
            status=status,
            er_code_used=vehicle.er_reference_code,
            verification_label=VERIFICATION_LABEL
        )
        return entry


def haversine_dist(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


anti_misuse_engine = AntiMisuseAuditEngine()
