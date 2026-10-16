# test_password.py
from src.core.security import verify_password

# The NEW hash
stored_hash = "$2b$12$yAxbcbvwR4kg/QHy/RWsc.WMv9mA3.GGSOVg.4ixHPCBpQfLi4c8i"

# The plain text password
plain_password = "SecurePassword123!"

# Test verification
result = verify_password(plain_password, stored_hash)
print(f"Password: {plain_password}")
print(f"Hash: {stored_hash}")
print(f"Verification result: {result}")

if result:
    print("✅ Password matches!")
else:
    print("❌ Password does NOT match!")