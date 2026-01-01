from app import app
from models import db, User

# REPLACE 'admin' WITH YOUR EXACT USERNAME
target_username = 'Admin' 

with app.app_context():
    user = User.query.filter_by(username=target_username).first()
    if user:
        user.is_admin = True
        db.session.commit()
        print(f"✅ SUCCESS: User '{user.username}' is now an Admin!")
    else:
        print(f"❌ ERROR: User '{target_username}' not found.")