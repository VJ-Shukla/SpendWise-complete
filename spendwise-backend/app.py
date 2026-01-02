from flask import Flask
from flask_cors import CORS
from config import Config
from models import db
from extensions import mail

def create_app():
    app = Flask(__name__)
    
    # 1. Load Configuration
    app.config.from_object(Config)
    
    # 2. Enable CORS (Allows Frontend to talk to Backend)
    # UPDATED: This specific setting fixes the "Preflight" error by allowing all origins
    CORS(app, resources={r"/*": {"origins": "*"}})
    
    # 3. Initialize Extensions
    db.init_app(app)
    mail.init_app(app)
    
    # 4. Register Blueprints (Routes)
    from routes import main
    app.register_blueprint(main)
    
    # 5. Create Tables Automatically
    # This is the standard way for Flask to ensure tables exist
    with app.app_context():
        db.create_all()

    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
