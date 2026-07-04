import logging
import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send"

def send_push_notification(push_token: str, title: str, body: str, data: dict = None):
    """
    Sends a push notification via Expo Push API.
    """
    if not push_token:
        return
        
    # Valid Expo push tokens start with ExponentPushToken or ExpoPushToken
    if not push_token.startswith("ExponentPushToken") and not push_token.startswith("ExpoPushToken"):
        logger.warning(f"Invalid Expo push token format: {push_token}")
        return

    payload = {
        "to": push_token,
        "title": title,
        "body": body,
        "data": data or {},
    }

    try:
        # Fire and forget (in a real production app, handle retries)
        # Using httpx post in synchronous mode since this might be called in sync routes
        with httpx.Client() as client:
            resp = client.post(EXPO_PUSH_API, json=payload, timeout=5.0)
            if resp.status_code != 200:
                logger.error(f"Failed to send push notification: {resp.text}")
    except Exception as e:
        logger.error(f"Error sending push notification: {e}")
