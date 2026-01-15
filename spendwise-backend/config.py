import os
from dotenv import load_dotenv

# Load keys from .env
load_dotenv()

class Config:
    # Security Key
    SECRET_KEY = os.getenv('SECRET_KEY', 'default_secret_key_if_none_found')
    
    # Database Connection (Fixes Render's postgres:// issue automatically)
    uri = os.getenv('DATABASE_URL')
    if uri and uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql://", 1)
        
    SQLALCHEMY_DATABASE_URI = uri
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # === EMAIL CONFIGURATION (SMTP) ===
    # Using Gmail settings by default
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')  # Loaded from .env
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')  # Loaded from .env
    # This adds the professional name "SpendWise Team" to your emails
    MAIL_DEFAULT_SENDER = "SpendWise Team <spendwise64@gmail.com>"
