from fastapi import APIRouter, HTTPException

from src.api.services.email_service import send_test_email

router = APIRouter()


@router.post("/test")
async def test_email():
    recipient_email = "jackelyngomez212@gmail.com"

    try:
        message_id = await send_test_email(recipient_email)

        return {
            "success": True,
            "message": "Test email sent successfully",
            "recipient": recipient_email,
            "message_id": message_id,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send email: {str(e)}"
        )