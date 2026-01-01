from app import app
from models import db, User

#  👇 TYPE YOUR EXACT USERNAME HERE
my_username = "Admin" 

with app.app_context():
    # 1. Find the user
    user = User.query.filter_by(username=my_username).first()
    
    if user:
        # 2. Force them to be admin
        user.is_admin = True
        db.session.commit()
        
        # 3. Verify it worked
        print(f"\n✅ SUCCESS: User '{user.username}' is now an ADMIN.")
        print(f"   Email: {user.email}")
        print(f"   Is Admin? {user.is_admin}\n")
    else:
        print(f"\n❌ ERROR: Could not find user '{my_username}'.")
        print("   Please check the spelling or register a new user first.\n")