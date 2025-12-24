import hmac
import hashlib
import json
import time
import requests
from flask import current_app
from sqlalchemy.exc import SQLAlchemyError
from models.webhook import Webhook
from utils.session_manager import get_session, safe_close


def sign_payload(payload: dict, secret: str) -> str:
    """HMAC-SHA256 signature for payload verification"""
    if not secret:
        return ""
    payload_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    return hmac.new(
        secret.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def trigger_webhooks(event_type: str, data: dict):
    """Trigger all matching enabled webhooks"""
    session = get_session()
    try:
        webhooks = session.query(Webhook).filter_by(
            event_type=event_type,
            enabled=True
        ).all()

        if not webhooks:
            return

        payload_base = {
            "event": event_type,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.%fZ", time.gmtime()),
            "data": data
        }

        for webhook in webhooks:
            payload = payload_base.copy()
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "Fullfill-Webhook/1.0"
            }

            if webhook.secret:
                signature = sign_payload(payload, webhook.secret)
                headers["X-Webhook-Signature"] = f"sha256={signature}"

            try:
                start = time.time()
                resp = requests.post(
                    webhook.url.strip(),
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                duration = round((time.time() - start) * 1000, 1)

                status = "success" if resp.status_code < 400 else "failed"
                current_app.logger.info(
                    f"[WEBHOOK] {webhook.id} → {webhook.url} "
                    f"[{event_type}] → {status} ({resp.status_code}) "
                    f"in {duration}ms"
                )

            except requests.RequestException as e:
                current_app.logger.error(
                    f"[WEBHOOK] {webhook.id} failed: {str(e)}"
                )

    except SQLAlchemyError as e:
        current_app.logger.error(f"DB error loading webhooks: {str(e)}")
    finally:
        safe_close(session)