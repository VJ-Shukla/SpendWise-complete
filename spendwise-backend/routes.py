import csv
import io
from flask import send_file, make_response
from flask import Blueprint, request, jsonify, current_app
from models import db, User, Expense, Income, Budget, RecurringExpense, EmergencyFund, Feedback
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy import func, extract
from extensions import mail
from flask_mail import Message
import jwt
import datetime
from functools import wraps
from threading import Thread

# === REPORTLAB IMPORTS FOR PDF ===
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch

main = Blueprint('main', __name__)

# ==========================================
# 1. SECURITY & UTILS
# ==========================================

def send_async_email(subject, recipient, body):
    app = current_app._get_current_object()
    msg = Message(subject, recipients=[recipient])
    msg.body = body
    thr = Thread(target=send_email_thread, args=(app, msg))
    thr.start()

def send_email_thread(app, msg):
    with app.app_context():
        try:
            mail.send(msg)
        except Exception as e:
            print(f"Email Error: {e}")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'error': 'Token is missing!'}), 401
        
        try:
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.filter_by(id=data['user_id']).first()
        except:
            return jsonify({'error': 'Token is invalid!'}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated

# ==========================================
# 2. AUTHENTICATION
# ==========================================

@main.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if User.query.filter_by(username=data.get('username')).first():
        return jsonify({'error': 'Username already exists'}), 400
    if User.query.filter_by(email=data.get('email')).first():
        return jsonify({'error': 'Email already exists'}), 400

    hashed_password = generate_password_hash(data.get('password'), method='pbkdf2:sha256')
    new_user = User(username=data.get('username'), email=data.get('email'), password_hash=hashed_password, user_type=data.get('user_type', 'individual'))
    fund = EmergencyFund(user=new_user)
    
    db.session.add(new_user)
    db.session.add(fund)
    db.session.commit()
    
    send_async_email("Welcome to SpendWise", new_user.email, f"Hi {new_user.username},\n\nWelcome to SpendWise! Your account has been created.")
    return jsonify({'message': 'User created successfully'}), 201

@main.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()
    if not user or not check_password_hash(user.password_hash, data.get('password')):
        return jsonify({'error': 'Invalid username or password'}), 401
        
    token = jwt.encode({'user_id': user.id, 'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)}, current_app.config['SECRET_KEY'], algorithm="HS256")
    return jsonify({'message': 'Login successful', 'access_token': token, 'username': user.username, 'email': user.email, 'user_type': user.user_type, 'is_admin': user.is_admin})

@main.route('/auth/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email')
    user = User.query.filter_by(email=email).first()
    if user:
        token = jwt.encode({'user_id': user.id, 'exp': datetime.datetime.utcnow() + datetime.timedelta(minutes=15)}, current_app.config['SECRET_KEY'], algorithm="HS256")
        base_url = "https://spend-wise-complete.vercel.app" if 'render' in request.host else "http://127.0.0.1:5500/spendwise-frontend/index.html"
        link = f"{base_url}?reset_token={token}"
        send_async_email("SpendWise Password Reset", email, f"Click here to reset: {link}")
    return jsonify({'message': 'If registered, you will receive a reset link.'})

@main.route('/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    try:
        payload = jwt.decode(data.get('token'), current_app.config['SECRET_KEY'], algorithms=["HS256"])
        user = User.query.filter_by(id=payload['user_id']).first()
        if user:
            user.password_hash = generate_password_hash(data.get('new_password'), method='pbkdf2:sha256')
            db.session.commit()
            send_async_email("Password Changed", user.email, "Your password has been reset.")
            return jsonify({'message': 'Password reset successful'})
        return jsonify({'error': 'User not found'}), 404
    except:
        return jsonify({'error': 'Invalid token'}), 400

# ==========================================
# 3. DASHBOARD
# ==========================================

@main.route('/dashboard', methods=['GET'])
@token_required
def get_dashboard_data(current_user):
    month_str = request.args.get('month', datetime.datetime.now().strftime('%Y-%m'))
    
    expenses = Expense.query.filter_by(user_id=current_user.id).filter(Expense.date.like(f'{month_str}%')).all()
    incomes = Income.query.filter_by(user_id=current_user.id).filter(Income.date.like(f'{month_str}%')).all()

    total_income = sum(i.amount for i in incomes)
    total_expenses = sum(e.amount for e in expenses)
    
    recent = Expense.query.filter_by(user_id=current_user.id).order_by(Expense.date.desc()).limit(5).all()
    recent_data = [{'id': e.id, 'category': e.category, 'amount': e.amount, 'date': e.date, 'description': e.description} for e in recent]
    
    cat_map = {}
    for e in expenses:
        if e.category not in cat_map: cat_map[e.category] = 0
        cat_map[e.category] += e.amount
    
    category_data = [{'category': k, 'amount': v, 'percentage': round((v/total_expenses*100),1)} for k,v in cat_map.items()] if total_expenses > 0 else []

    return jsonify({
        'total_income': total_income,
        'total_expenses': total_expenses,
        'net_savings': total_income - total_expenses,
        'savings_rate': ((total_income - total_expenses) / total_income * 100) if total_income > 0 else 0,
        'recent_transactions': recent_data,
        'category_expenses': category_data
    })

@main.route('/analytics/monthly', methods=['GET'])
@token_required
def get_monthly_trends(current_user):
    incomes = db.session.query(func.substr(Income.date, 1, 7).label('month'), func.sum(Income.amount)).filter_by(user_id=current_user.id).group_by('month').all()
    expenses = db.session.query(func.substr(Expense.date, 1, 7).label('month'), func.sum(Expense.amount)).filter_by(user_id=current_user.id).group_by('month').all()
    
    data_map = {}
    all_months = set()
    for i in incomes: 
        data_map[i[0]] = {'month': i[0], 'income': i[1], 'expenses': 0}; all_months.add(i[0])
    for e in expenses:
        if e[0] not in data_map: data_map[e[0]] = {'month': e[0], 'income': 0, 'expenses': 0}
        data_map[e[0]]['expenses'] = e[1]; all_months.add(e[0])

    if not all_months: latest_date = datetime.date.today()
    else:
        latest_str = sorted(list(all_months))[-1]
        latest_date = datetime.date(int(latest_str[:4]), int(latest_str[5:7]), 1)
        if latest_date < datetime.date.today().replace(day=1): latest_date = datetime.date.today()

    final_result = []
    curr_year, curr_month = latest_date.year, latest_date.month
    for _ in range(12):
        key = f"{curr_year}-{curr_month:02d}"
        final_result.append(data_map.get(key, {'month': key, 'income': 0, 'expenses': 0}))
        curr_month -= 1
        if curr_month == 0: curr_month = 12; curr_year -= 1

    return jsonify(final_result[::-1])

# ==========================================
# 4. STANDARD CRUD ROUTES
# ==========================================

@main.route('/expenses', methods=['GET', 'POST'])
@token_required
def handle_expenses(current_user):
    if request.method == 'POST':
        data = request.get_json()
        db.session.add(Expense(amount=data['amount'], category=data['category'], date=data['date'], payment_method=data.get('payment_method'), description=data.get('description'), user_id=current_user.id))
        db.session.commit()
        return jsonify({'message': 'Expense added'}), 201
    exps = Expense.query.filter_by(user_id=current_user.id).order_by(Expense.date.desc()).all()
    return jsonify([{'id': e.id, 'amount': e.amount, 'category': e.category, 'date': e.date, 'description': e.description} for e in exps])

@main.route('/expenses/<int:id>', methods=['DELETE'])
@token_required
def delete_expense(current_user, id):
    exp = Expense.query.filter_by(id=id, user_id=current_user.id).first()
    if exp: db.session.delete(exp); db.session.commit()
    return jsonify({'message': 'Deleted'})

@main.route('/income', methods=['GET', 'POST'])
@token_required
def handle_income(current_user):
    if request.method == 'POST':
        data = request.get_json()
        db.session.add(Income(amount=data['amount'], source=data['source'], date=data['date'], user_id=current_user.id))
        db.session.commit()
        return jsonify({'message': 'Income added'}), 201
    incs = Income.query.filter_by(user_id=current_user.id).order_by(Income.date.desc()).all()
    return jsonify([{'id': i.id, 'amount': i.amount, 'source': i.source, 'date': i.date} for i in incs])

# --- NEW: DELETE INCOME ROUTE ---
@main.route('/income/<int:id>', methods=['DELETE'])
@token_required
def delete_income(current_user, id):
    inc = Income.query.filter_by(id=id, user_id=current_user.id).first()
    if inc: 
        db.session.delete(inc)
        db.session.commit()
        return jsonify({'message': 'Deleted'})
    return jsonify({'error': 'Income not found'}), 404

@main.route('/budget', methods=['GET', 'POST'])
@token_required
def handle_budget(current_user):
    if request.method == 'POST':
        data = request.get_json()
        existing = Budget.query.filter_by(user_id=current_user.id, category=data['category'], month=data['month']).first()
        if existing: existing.amount = data['amount']
        else: db.session.add(Budget(category=data['category'], amount=data['amount'], month=data['month'], user_id=current_user.id))
        db.session.commit()
        return jsonify({'message': 'Budget set'}), 201
    month = request.args.get('month', datetime.datetime.now().strftime('%Y-%m'))
    buds = Budget.query.filter_by(user_id=current_user.id, month=month).all()
    return jsonify([{'category': b.category, 'amount': b.amount, 'month': b.month} for b in buds])

@main.route('/budget-analysis', methods=['GET'])
@token_required
def budget_analysis(current_user):
    month = request.args.get('month', datetime.datetime.now().strftime('%Y-%m'))
    budgets = Budget.query.filter_by(user_id=current_user.id, month=month).all()
    analysis = []
    for b in budgets:
        spent = db.session.query(func.sum(Expense.amount)).filter(Expense.user_id == current_user.id, Expense.category == b.category, Expense.date.like(f'{month}%')).scalar() or 0
        analysis.append({'category': b.category, 'budgeted': b.amount, 'actual': spent, 'status': 'over' if spent > b.amount else 'under'})
    return jsonify(analysis)

@main.route('/recurring', methods=['GET', 'POST', 'DELETE'])
@main.route('/recurring/<int:id>', methods=['DELETE'])
@token_required
def handle_recurring(current_user, id=None):
    if request.method == 'POST':
        data = request.get_json()
        db.session.add(RecurringExpense(description=data['description'], amount=data['amount'], category=data['category'], frequency=data['frequency'], next_due_date=data['next_due_date'], user_id=current_user.id))
        db.session.commit(); return jsonify({'message': 'Added'}), 201
    if request.method == 'DELETE':
        rec = RecurringExpense.query.filter_by(id=id, user_id=current_user.id).first()
        if rec: db.session.delete(rec); db.session.commit()
        return jsonify({'message': 'Deleted'})
    recs = RecurringExpense.query.filter_by(user_id=current_user.id).all()
    return jsonify([{'id': r.id, 'description': r.description, 'amount': r.amount, 'next_due_date': r.next_due_date, 'frequency': r.frequency} for r in recs])

# ==========================================
# 5. OTHER FEATURES
# ==========================================

@main.route('/emergency-fund', methods=['GET', 'PUT'])
@token_required
def handle_fund(current_user):
    fund = EmergencyFund.query.filter_by(user_id=current_user.id).first()
    if not fund: fund = EmergencyFund(user_id=current_user.id); db.session.add(fund); db.session.commit()
    if request.method == 'PUT':
        data = request.get_json()
        for k, v in data.items(): setattr(fund, k, v)
        db.session.commit(); return jsonify({'message': 'Fund updated'})
    return jsonify({'target_amount': fund.target_amount, 'current_amount': fund.current_amount, 'alert_threshold': fund.alert_threshold, 'monthly_goal': fund.monthly_goal, 'progress_percentage': round((fund.current_amount/fund.target_amount*100), 1) if fund.target_amount > 0 else 0})

@main.route('/user/profile', methods=['PUT'])
@token_required
def update_profile(current_user):
    data = request.get_json()
    if 'username' in data: current_user.username = data['username']
    if 'email' in data: current_user.email = data['email']
    if 'user_type' in data: current_user.user_type = data['user_type']
    db.session.commit(); return jsonify({'message': 'Profile updated'})

@main.route('/user/password', methods=['PUT'])
@token_required
def update_password(current_user):
    data = request.get_json()
    if not check_password_hash(current_user.password_hash, data['current_password']): return jsonify({'error': 'Incorrect current password'}), 401
    current_user.password_hash = generate_password_hash(data['new_password'], method='pbkdf2:sha256')
    db.session.commit()
    send_async_email("Security Alert: Password Changed", current_user.email, "Your password was just changed.")
    return jsonify({'message': 'Password updated'})

@main.route('/feedback', methods=['POST'])
@token_required
def submit_feedback(current_user):
    data = request.get_json()
    db.session.add(Feedback(user_username=current_user.username, rating=data['rating'], message=data['message']))
    db.session.commit(); return jsonify({'message': 'Feedback received'})

@main.route('/admin/stats', methods=['GET'])
@token_required
def admin_stats(current_user):
    if not current_user.is_admin: return jsonify({'error': 'Unauthorized'}), 403
    return jsonify({'total_users': User.query.count(), 'total_volume': db.session.query(func.sum(Expense.amount)).scalar() or 0, 'total_feedback': Feedback.query.count()})

# --- UPDATED: RETURN USER ID ---
@main.route('/admin/users', methods=['GET'])
@token_required
def admin_users(current_user):
    if not current_user.is_admin: return jsonify({'error': 'Unauthorized'}), 403
    return jsonify([{'id': u.id, 'username': u.username, 'email': u.email, 'user_type': u.user_type, 'joined': u.joined_at.strftime('%Y-%m-%d'), 'is_admin': u.is_admin} for u in User.query.limit(20).all()])

# --- NEW: DELETE USER ROUTE ---
@main.route('/admin/users/<int:user_id>', methods=['DELETE'])
@token_required
def delete_user(current_user, user_id):
    if not current_user.is_admin: return jsonify({'error': 'Unauthorized'}), 403
    
    user_to_delete = User.query.get(user_id)
    if user_to_delete:
        if user_to_delete.id == current_user.id: return jsonify({'error': 'Cannot delete yourself'}), 400
        
        # Clean up related data first
        Expense.query.filter_by(user_id=user_id).delete()
        Income.query.filter_by(user_id=user_id).delete()
        Budget.query.filter_by(user_id=user_id).delete()
        RecurringExpense.query.filter_by(user_id=user_id).delete()
        EmergencyFund.query.filter_by(user_id=user_id).delete()
        
        db.session.delete(user_to_delete)
        db.session.commit()
        return jsonify({'message': 'User deleted'})
    return jsonify({'error': 'User not found'}), 404

@main.route('/admin/feedback', methods=['GET'])
@token_required
def admin_feedback(current_user):
    if not current_user.is_admin: return jsonify({'error': 'Unauthorized'}), 403
    return jsonify([{'user': f.user_username, 'rating': f.rating, 'message': f.message, 'date': f.date.strftime('%Y-%m-%d')} for f in Feedback.query.order_by(Feedback.date.desc()).limit(20).all()])

# ==========================================
# 6. EXPORT DATA (CSV & PDF)
# ==========================================
@main.route('/export/<format_type>', methods=['GET'])
@token_required
def export_data(current_user, format_type):
    try:
        incomes = Income.query.filter_by(user_id=current_user.id).order_by(Income.date.desc()).all()
        expenses = Expense.query.filter_by(user_id=current_user.id).order_by(Expense.date.desc()).all()
        
        total_inc = sum(i.amount for i in incomes)
        total_exp = sum(e.amount for e in expenses)
        net_savings = total_inc - total_exp

        monthly_map = {}
        for i in incomes:
            m = i.date[:7]
            if m not in monthly_map: monthly_map[m] = {'income': 0, 'expense': 0}
            monthly_map[m]['income'] += i.amount

        for e in expenses:
            m = e.date[:7]
            if m not in monthly_map: monthly_map[m] = {'income': 0, 'expense': 0}
            monthly_map[m]['expense'] += e.amount
        
        sorted_months = sorted(monthly_map.keys(), reverse=True)

        if format_type == 'csv':
            si = io.StringIO(); cw = csv.writer(si)
            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            cw.writerow(['SPENDWISE FINANCIAL REPORT'])
            cw.writerow(['User Account:', current_user.username]); cw.writerow(['Email:', current_user.email]); cw.writerow(['Generated Date:', now_str]); cw.writerow([])
            cw.writerow(['--- EXECUTIVE SUMMARY (LIFETIME) ---']); cw.writerow(['Metric', 'Amount (INR)'])
            cw.writerow(['Total Income', total_inc]); cw.writerow(['Total Expenses', total_exp]); cw.writerow(['Net Savings', net_savings])
            savings_rate = round((net_savings / total_inc * 100), 1) if total_inc > 0 else 0
            cw.writerow(['Overall Savings Rate', f"{savings_rate}%"]); cw.writerow([])
            cw.writerow(['--- MONTHLY ANALYSIS ---']); cw.writerow(['Month', 'Total Income', 'Total Expenses', 'Net Flow', 'Status'])
            for m in sorted_months:
                d = monthly_map[m]; flow = d['income'] - d['expense']; status = "Saved" if flow >= 0 else "Overspent"
                cw.writerow([m, d['income'], d['expense'], flow, status])
            cw.writerow([])
            cw.writerow(['--- TRANSACTION LEDGER ---']); cw.writerow(['Date', 'Type', 'Category', 'Description', 'Payment Method', 'Amount'])
            all_txns = []
            for i in incomes: all_txns.append({'date': i.date, 'type': 'INCOME', 'cat': i.source, 'desc': '-', 'method': 'N/A', 'amt': i.amount})
            for e in expenses: all_txns.append({'date': e.date, 'type': 'EXPENSE', 'cat': e.category, 'desc': e.description or '-', 'method': e.payment_method or 'Cash', 'amt': e.amount})
            all_txns.sort(key=lambda x: x['date'], reverse=True)
            for t in all_txns: cw.writerow([t['date'], t['type'], t['cat'], t['desc'], t['method'], t['amt']])
            
            output = make_response(si.getvalue())
            output.headers["Content-Disposition"] = "attachment; filename=spendwise_report.csv"; output.headers["Content-type"] = "text/csv"
            return output

        elif format_type == 'pdf':
            buffer = io.BytesIO(); doc = SimpleDocTemplate(buffer, pagesize=letter); elements = []; styles = getSampleStyleSheet()
            elements.append(Paragraph(f"SpendWise Report - {current_user.username}", styles['Title'])); elements.append(Spacer(1, 0.2 * inch))
            
            elements.append(Paragraph("Lifetime Summary", styles['Heading2']))
            summary_data = [['Total Income', 'Total Expenses', 'Net Savings'], [f"Rs. {total_inc}", f"Rs. {total_exp}", f"Rs. {net_savings}"]]
            t_summary = Table(summary_data, colWidths=[2.5*inch, 2.5*inch, 2.5*inch])
            t_summary.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.grey), ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke), ('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('BOTTOMPADDING', (0, 0), (-1, 0), 12), ('GRID', (0, 0), (-1, -1), 1, colors.black)]))
            elements.append(t_summary); elements.append(Spacer(1, 0.3 * inch))

            elements.append(Paragraph("Monthly Breakdown", styles['Heading2']))
            month_table_data = [['Month', 'Income', 'Expenses', 'Savings']]
            for m in sorted_months:
                d = monthly_map[m]; month_table_data.append([m, f"Rs. {d['income']}", f"Rs. {d['expense']}", f"Rs. {d['income'] - d['expense']}"])
            t_months = Table(month_table_data, colWidths=[2*inch, 2*inch, 2*inch, 1.5*inch])
            t_months.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]), ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)]))
            elements.append(t_months); elements.append(Spacer(1, 0.3 * inch))

            elements.append(Paragraph("Transaction History", styles['Heading2']))
            table_data = [['Date', 'Type', 'Category', 'Amount']]
            all_txns = []
            for i in incomes: all_txns.append({'date': i.date, 'type': 'Income', 'cat': i.source, 'amt': i.amount})
            for e in expenses: all_txns.append({'date': e.date, 'type': 'Expense', 'cat': e.category, 'amt': e.amount})
            all_txns.sort(key=lambda x: x['date'], reverse=True)
            for t in all_txns: table_data.append([t['date'], t['type'], t['cat'], f"Rs. {t['amt']}"])
            t_main = Table(table_data, colWidths=[1.5*inch, 1.5*inch, 3*inch, 1.5*inch])
            t_main.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), colors.darkblue), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white), ('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.whitesmoke, colors.white]), ('GRID', (0, 0), (-1, -1), 0.5, colors.grey)]))
            elements.append(t_main)
            doc.build(elements); buffer.seek(0)
            return send_file(buffer, as_attachment=True, download_name='report.pdf', mimetype='application/pdf')
            
    except Exception as e:
        print(f"Export Error: {e}")
        return jsonify({'error': 'Export failed'}), 500

# ==========================================
# 7. NEW: OVERALL ANALYTICS (LIFETIME)
# ==========================================
@main.route('/analytics/overall', methods=['GET'])
@token_required
def get_overall_analytics(current_user):
    try:
        total_income = db.session.query(func.sum(Income.amount)).filter_by(user_id=current_user.id).scalar() or 0
        total_expenses = db.session.query(func.sum(Expense.amount)).filter_by(user_id=current_user.id).scalar() or 0
        
        cat_query = db.session.query(Expense.category, func.sum(Expense.amount)).filter_by(user_id=current_user.id).group_by(Expense.category).order_by(func.sum(Expense.amount).desc()).all()
        category_data = [{'category': c[0], 'amount': c[1], 'percentage': round((c[1] / total_expenses * 100), 1) if total_expenses > 0 else 0} for c in cat_query]

        today = datetime.date.today(); first_day_this_month = today.replace(day=1)
        last_month_date = first_day_this_month - datetime.timedelta(days=1); first_day_prev_month = last_month_date.replace(day=1)
        try: target_prev_date = last_month_date.replace(day=today.day)
        except ValueError: target_prev_date = last_month_date 
            
        this_month_spend = db.session.query(func.sum(Expense.amount)).filter(Expense.user_id == current_user.id, Expense.date >= str(first_day_this_month), Expense.date <= str(today)).scalar() or 0
        prev_month_spend = db.session.query(func.sum(Expense.amount)).filter(Expense.user_id == current_user.id, Expense.date >= str(first_day_prev_month), Expense.date <= str(target_prev_date)).scalar() or 0

        trend_query = db.session.query(func.substr(Expense.date, 1, 7).label('month'), func.sum(Expense.amount)).filter_by(user_id=current_user.id).group_by('month').order_by('month').all()
        trend_data = [{'month': t[0], 'amount': t[1]} for t in trend_query]

        return jsonify({
            'total_income': total_income,
            'total_expenses': total_expenses,
            'net_savings': total_income - total_expenses,
            'categories': category_data,
            'comparison': {'this_month_val': this_month_spend, 'prev_month_val': prev_month_spend, 'current_date_label': today.strftime("%b %d"), 'prev_date_label': target_prev_date.strftime("%b %d")},
            'trend': trend_data
        })
    except Exception as e:
        print(e)
        return jsonify({'error': 'Analysis failed'}), 500
