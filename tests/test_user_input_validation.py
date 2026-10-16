import pytest
from pydantic import ValidationError

from src.api.schemas.users import UserCreate, UserUpdate


def account_payload():
    return {
        "first_name": "Élise",
        "last_name": "Dela Cruz",
        "username": "elise.dela-cruz",
        "email_address": "elise@example.com",
        "phone_number": "09171234567",
        "role": "Municipal Coordinator",
        "password": "Password1!",
    }


def test_account_input_allows_unicode_letters_and_common_name_punctuation():
    payload = account_payload()
    payload["first_name"] = "श्री"
    user = UserCreate(**payload)
    assert user.first_name == "श्री"
    assert user.last_name == "Dela Cruz"


@pytest.mark.parametrize(
    ("first_name", "last_name", "expected_first", "expected_last"),
    [
        ("john", "mary anne", "John", "Mary Anne"),
        ("juan", "dela cruz", "Juan", "Dela Cruz"),
        ("māori", "o'neil", "Māori", "O'Neil"),
    ],
)
def test_account_names_are_title_cased(first_name, last_name, expected_first, expected_last):
    payload = account_payload()
    payload["first_name"] = first_name
    payload["last_name"] = last_name
    user = UserCreate(**payload)
    assert user.first_name == expected_first
    assert user.last_name == expected_last


@pytest.mark.parametrize(
    "email",
    [
        "person@gmail.com",
        "person@outlook.com",
        "person@yahoo.com",
        "person@icloud.com",
        "person@protonmail.com",
        "person@department.example",
    ],
)
def test_email_accepts_common_and_custom_domains(email):
    payload = account_payload()
    payload["email_address"] = email
    assert UserCreate(**payload).email_address == email


def test_account_creation_rejects_malformed_email():
    payload = account_payload()
    payload["email_address"] = "not-an-email"
    with pytest.raises(ValidationError):
        UserCreate(**payload)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("first_name", "Ana 🙂"),
        ("last_name", "Dela@Cruz"),
        ("username", "name🙂"),
        ("phone_number", "0917-123-456"),
        ("phone_number", "０９１７１２３４５６７"),
    ],
)
def test_account_input_rejects_unsupported_characters(field, value):
    payload = account_payload()
    payload[field] = value
    with pytest.raises(ValidationError):
        UserCreate(**payload)


def test_profile_update_uses_the_same_field_validation():
    assert UserUpdate(first_name="māori").first_name == "Māori"
    assert UserUpdate(last_name="dela cruz").last_name == "Dela Cruz"
    with pytest.raises(ValidationError):
        UserUpdate(first_name="Name🚀")


def test_staff_account_schemas_do_not_collect_birthdate():
    user = UserCreate(**account_payload())
    assert "birthdate" not in UserCreate.model_fields
    assert "birthdate" not in UserUpdate.model_fields
    assert not hasattr(user, "birthdate")


def test_password_feedback_requirements_are_enforced_by_api_schema():
    payload = account_payload()
    payload["password"] = "Password1"
    with pytest.raises(ValidationError, match="one special character"):
        UserCreate(**payload)

    payload["password"] = "Password1!"
    assert UserCreate(**payload).password == "Password1!"
