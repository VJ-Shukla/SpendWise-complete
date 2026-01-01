from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# Initialize the Database Manager
db = SQLAlchemy()

# 1. User Table
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False) # Critical for Email Features
    password_hash = db.Column(db.String(256), nullable=False)
    user_type = db.Column(db.String(20), default='individual')
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_admin = db.Column(db.Boolean, default=False)

    # Relationships (Link data to user)
    expenses = db.relationship('Expense', backref='user', lazy=True)
    incomes = db.relationship('Income', backref='user', lazy=True)
    budgets = db.relationship('Budget', backref='user', lazy=True)
    subscriptions = db.relationship('RecurringExpense', backref='user', lazy=True)
    emergency_fund = db.relationship('EmergencyFund', backref='user', uselist=False, lazy=True)

# 2. Expense Table
class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    date = db.Column(db.String(10), nullable=False) # YYYY-MM-DD
    payment_method = db.Column(db.String(50))
    description = db.Column(db.String(200))
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# 3. Income Table
class Income(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Float, nullable=False)
    source = db.Column(db.String(50), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# 4. Budget Table
class Budget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    month = db.Column(db.String(7), nullable=False) # YYYY-MM
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# 5. Recurring/Subscriptions Table
class RecurringExpense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50))
    frequency = db.Column(db.String(20), default='monthly')
    next_due_date = db.Column(db.String(10), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

# 6. Emergency Fund Table
class EmergencyFund(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    target_amount = db.Column(db.Float, default=0.0)
    current_amount = db.Column(db.Float, default=0.0)
    alert_threshold = db.Column(db.Float, default=0.0)
    monthly_goal = db.Column(db.Float, default=0.0)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
# 7. Feedback Table (Admin use)
class Feedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_username = db.Column(db.String(80))
    rating = db.Column(db.Integer)
    message = db.Column(db.Text)
    date = db.Column(db.DateTime, default=datetime.utcnow)