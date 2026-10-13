# test_hash.py
from src.core.security import verify_password

# The NEW hash from your terminal
stored_hash = "$2b$12$VzGz3DZJHL2vtyhFPDXWUuUSpbfzkIC1taYlg7wCP5sAAXZ1D3r4q"
plain_password = "SecurePassword123!"

result = verify_password(plain_password, stored_hash)

print("=" * 60)
print(f"Password: {plain_password}")
print(f"Hash: {stored_hash}")
print(f"Hash length: {len(stored_hash)}")
print(f"Verification result: {result}")
print("=" * 60)

if result:
    print("✅ This hash works!")
else:
    print("❌ This hash is invalid!")