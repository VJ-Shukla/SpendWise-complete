from app import app
from models import db

# This script creates any missing tables in your database
# It will NOT delete or overwrite your existing users

if __name__ == "__main__":
    with app.app_context():
        try:
            db.create_all()
            print("\n✅ SUCCESS: Database tables checked and created!")
            print("   - If 'user' table was missing, it is now created.")
            print("   - If 'feedback' table was missing, it is now created.\n")
        except Exception as e:
            print(f"\n❌ ERROR: Could not create tables. Reason: {e}\n")