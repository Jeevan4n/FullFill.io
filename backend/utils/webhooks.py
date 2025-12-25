# utils/webhooks.py
import requests
import hmac
import hashlib
import json

from models.webhook import Webhook
from utils.session_manager import get_session, safe_close

def trigger_webhooks(event_type, payload, single_hook=None):
    session = get_session()
    try:
        if single_hook:
            hooks = [single_hook]
        else:
            hooks = session.query(Webhook).filter_by(event_type=event_type, enabled=True).all()

        results = []
        for hook in hooks:
            try:
                data = json.dumps(payload)
                headers = {'Content-Type': 'application/json'}
                if hook.secret:
                    signature = hmac.new(hook.secret.encode(), data.encode(), hashlib.sha256).hexdigest()
                    headers['X-Signature'] = f'sha256={signature}'
                res = requests.post(hook.url, data=data, headers=headers, timeout=10)
                results.append({'success': res.ok, 'status_code': res.status_code})
            except Exception as e:
                results.append({'success': False, 'error': str(e)})
        return results
    finally:
        safe_close(session)