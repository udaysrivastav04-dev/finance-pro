from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_mysqldb import MySQL
import MySQLdb.cursors
import bcrypt
from db_config import init_db
from datetime import datetime
import calendar

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
mysql = init_db(app)

# ---------- HELPERS ----------
def safe_fetchall(cursor):
    rows = cursor.fetchall()
    return rows if rows else []

# ---------- SIGNUP ----------
@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not all([name, email, password]):
        return jsonify({'status': 'error', 'message': 'All fields are required'}), 400

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cur.execute("SELECT * FROM users WHERE email=%s", (email,))
    if cur.fetchone():
        cur.close()
        return jsonify({'status': 'error', 'message': 'Account already exists'}), 400

    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    cur.execute(
        "INSERT INTO users (name, email, password_hash) VALUES (%s,%s,%s)",
        (name, email, hashed)
    )
    mysql.connection.commit()
    cur.close()
    return jsonify({'status': 'success', 'message': 'Account created successfully'}), 200

# ---------- LOGIN ----------
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cur.execute("SELECT * FROM users WHERE email=%s", (email,))
    user = cur.fetchone()
    cur.close()

    if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
        return jsonify({
            'status': 'success',
            'user': {
                'id': user['user_id'],
                'name': user['name'],
                'email': user['email']
            }
        }), 200
    
    return jsonify({'status': 'error', 'message': 'Invalid email or password'}), 401

# ---------- BUDGET: Add Budget (POST) ----------
@app.route('/add_budget', methods=['POST'])
def add_budget():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    amount = data.get('amount')

    if not user_id or amount is None:
        return jsonify({'status': 'error', 'message': 'user_id and amount required'}), 400

    try:
        amount_val = float(amount)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid amount'}), 400

    month_year = datetime.now().strftime('%Y-%m')

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    # Check if budget exists for this user and month
    cur.execute("SELECT * FROM budget WHERE user_id=%s AND month_year=%s", (user_id, month_year))
    existing = cur.fetchone()
    if existing:
        cur.execute("UPDATE budget SET amount=%s, created_at=CURRENT_TIMESTAMP WHERE budget_id=%s",
                    (amount_val, existing['budget_id']))
    else:
        cur.execute("INSERT INTO budget (user_id, amount, month_year) VALUES (%s,%s,%s)",
                    (user_id, amount_val, month_year))
    mysql.connection.commit()
    cur.close()
    return jsonify({'status': 'success', 'message': 'Budget set for current month'}), 200

# ---------- BUDGET: Get Budget (GET) ----------
@app.route('/get_budget', methods=['GET'])
def get_budget():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'user_id required'}), 400

    # Current month/year
    now = datetime.now()
    curr_month_year = now.strftime('%Y-%m')

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # Fetch current month's budget (if exists)
    cur.execute("SELECT amount FROM budget WHERE user_id=%s AND month_year=%s", (user_id, curr_month_year))
    row = cur.fetchone()
    budget_amount = float(row['amount']) if row and row.get('amount') is not None else 0.0

    # Calculate spent for current month (only expense)
    cur.execute("""
        SELECT COALESCE(SUM(amount),0) AS spent
        FROM transactions
        WHERE user_id=%s AND type='expense' AND DATE_FORMAT(date,'%%Y-%%m')=%s
    """, (user_id, curr_month_year))
    spent_row = cur.fetchone()
    spent_current = float(spent_row['spent']) if spent_row and spent_row.get('spent') is not None else 0.0

    remaining = round(budget_amount - spent_current, 2)

    # Remaining days
    total_days = calendar.monthrange(now.year, now.month)[1]
    days_left = max(0, total_days - now.day)

    # Smart note logic
    note = ""
    if budget_amount <= 0:
        note = "No budget set for this month."
    else:
        pct_remaining = (remaining / budget_amount) if budget_amount else 0
        if remaining < 0:
            note = "🚨 Over budget — time to cut expenses!"
        else:
            if pct_remaining >= 0.40:
                note = "✅ All good — you're managing well!"
            elif pct_remaining >= 0.10:
                note = "⚠️ You're at the edge, spend carefully!"
            else:
                note = "⚠️ You're at the edge, spend carefully!"

    # Previous up to 3 months (excluding current)
    prev_months = []
    for i in range(1, 4):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        prev_months.append(f"{y:04d}-{m:02d}")

    previous_data = []
    if prev_months:
        format_list = ",".join(["%s"] * len(prev_months))
        cur.execute(f"SELECT month_year, amount FROM budget WHERE user_id=%s AND month_year IN ({format_list})",
                    tuple([user_id] + prev_months))
        budgets_rows = cur.fetchall() or []

        cur.execute(f"""
            SELECT DATE_FORMAT(date, '%%Y-%%m') AS month_year, COALESCE(SUM(amount),0) AS spent
            FROM transactions
            WHERE user_id=%s AND type='expense' AND DATE_FORMAT(date,'%%Y-%%m') IN ({format_list})
            GROUP BY month_year
        """, tuple([user_id] + prev_months))
        spent_rows = cur.fetchall() or []

        budgets_map = {r['month_year']: float(r['amount']) for r in budgets_rows}
        spent_map = {r['month_year']: float(r['spent']) for r in spent_rows}

        for my in prev_months:
            if my in budgets_map or my in spent_map:
                previous_data.append({
                    'month_year': my,
                    'amount': budgets_map.get(my, 0.0),
                    'spent': spent_map.get(my, 0.0)
                })

    cur.close()

    return jsonify({
        'status': 'success',
        'current': {
            'month_year': curr_month_year,
            'amount': round(budget_amount, 2),
            'spent': round(spent_current, 2),
            'remaining': round(remaining, 2),
            'remaining_days': days_left,
            'note': note
        },
        'previous': previous_data
    }), 200

# ---------- TRANSACTIONS ----------
@app.route('/transactions', methods=['GET', 'POST'])
def transactions():
    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    if request.method == 'GET':
        user_id = request.args.get('user_id')
        if not user_id:
            cur.close()
            return jsonify({'status': 'error', 'message': 'user_id required'}), 400
        cur.execute(
            """SELECT txn_id, user_id, category, amount, type, date, created_at 
               FROM transactions WHERE user_id=%s 
               ORDER BY date DESC, created_at DESC""",
            (user_id,)
        )
        rows = safe_fetchall(cur)
        cur.close()
        return jsonify({'status': 'success', 'transactions': rows}), 200

    data = request.get_json() or {}
    user_id = data.get('user_id')
    category = data.get('category')
    amount = data.get('amount')
    txn_type = data.get('type')
    date = data.get('date')

    if not all([user_id, category, amount, txn_type, date]):
        cur.close()
        return jsonify({'status': 'error', 'message': 'All fields required'}), 400

    cur.execute(
        "INSERT INTO transactions (user_id, category, amount, type, date) VALUES (%s,%s,%s,%s,%s)",
        (user_id, category, amount, txn_type, date)
    )
    mysql.connection.commit()
    cur.close()
    return jsonify({'status': 'success', 'message': 'Transaction added'}), 200

# ---------- GOALS ----------
@app.route('/goals', methods=['GET', 'POST'])
def goals():
    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    if request.method == 'GET':
        user_id = request.args.get('user_id')
        if not user_id:
            cur.close()
            return jsonify({'status': 'error', 'message': 'user_id required'}), 400
        cur.execute(
            """SELECT goal_id, user_id, name, target, saved, date, status 
               FROM goals WHERE user_id=%s ORDER BY goal_id DESC""",
            (user_id,)
        )
        rows = safe_fetchall(cur)
        cur.close()
        return jsonify({'status': 'success', 'goals': rows}), 200

    data = request.get_json() or {}
    user_id = data.get('user_id')
    name = data.get('name')
    target = data.get('target')
    date = data.get('date')
    saved = data.get('saved', 0)

    if not all([user_id, name, target, date]):
        cur.close()
        return jsonify({'status': 'error', 'message': 'All fields required'}), 400

    cur.execute(
        "INSERT INTO goals (user_id, name, target, saved, date, status) VALUES (%s,%s,%s,%s,%s,%s)",
        (user_id, name, target, saved, date, 'in_progress')
    )
    mysql.connection.commit()
    cur.close()
    return jsonify({'status': 'success', 'message': 'Goal added'}), 200

# ---------- GOAL: UPDATE ----------
@app.route('/update_goal', methods=['POST'])
def update_goal():
    data = request.get_json() or {}
    goal_id = data.get('goal_id')
    name = data.get('name')
    target = data.get('target')
    date = data.get('date')

    if not goal_id:
        return jsonify({'status': 'error', 'message': 'goal_id required'}), 400

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cur.execute("UPDATE goals SET name=%s, target=%s, date=%s WHERE goal_id=%s",
                (name, target, date, goal_id))
    mysql.connection.commit()
    cur.close()
    return jsonify({'status': 'success', 'message': 'Goal updated'}), 200

# ---------- GOAL: DELETE ----------
@app.route('/delete_goal', methods=['POST'])
def delete_goal():
    data = request.get_json() or {}
    goal_id = data.get('goal_id')
    if not goal_id:
        return jsonify({'status': 'error', 'message': 'goal_id required'}), 400

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    # delete savings first (if table exists) - leave cascade if FK exists
    try:
        cur.execute("DELETE FROM goal_savings WHERE goal_id=%s", (goal_id,))
    except Exception:
        # table might not exist — ignore
        pass
    cur.execute("DELETE FROM goals WHERE goal_id=%s", (goal_id,))
    mysql.connection.commit()
    cur.close()
    return jsonify({'status': 'success', 'message': 'Goal deleted'}), 200

# ---------- GOAL: ADD MONEY ----------
@app.route('/add_goal_money', methods=['POST'])
def add_goal_money():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    goal_id = data.get('goal_id')
    amount = data.get('amount')
    date = data.get('date')  # expected YYYY-MM-DD
    note = data.get('note', None)

    # require user_id as well
    if not all([user_id, goal_id, amount, date]):
        return jsonify({'status': 'error', 'message': 'user_id, goal_id, amount, and date required'}), 400

    try:
        amount_val = float(amount)
    except Exception:
        return jsonify({'status': 'error', 'message': 'Invalid amount format'}), 400

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)

    # ensure goal exists and belongs to user (optional safety)
    cur.execute("SELECT saved, target, user_id FROM goals WHERE goal_id=%s", (goal_id,))
    goal = cur.fetchone()
    if not goal:
        cur.close()
        return jsonify({'status': 'error', 'message': 'Goal not found'}), 404
    # optional: ensure same user
    if str(goal.get('user_id')) != str(user_id):
        cur.close()
        return jsonify({'status': 'error', 'message': 'Unauthorized or wrong user for this goal'}), 403

    # Insert into goal_savings (with user_id)
    try:
        cur.execute("""
            INSERT INTO goal_savings (user_id, goal_id, amount, date, note)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, goal_id, amount_val, date, note))
    except Exception as err:
        # try creating table as fallback (safer to create via migration, but kept here)
        try:
            cur.execute("""
            CREATE TABLE IF NOT EXISTS goal_savings (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              goal_id INT NOT NULL,
              amount DECIMAL(12,2) NOT NULL,
              date DATE NOT NULL,
              note VARCHAR(255),
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (goal_id) REFERENCES goals(goal_id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
            """)
            cur.execute("""
                INSERT INTO goal_savings (user_id, goal_id, amount, date, note)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, goal_id, amount_val, date, note))
        except Exception as err2:
            cur.close()
            return jsonify({'status': 'error', 'message': 'Failed to record saving: ' + str(err2)}), 500

    # update saved amount on goal and mark completed if threshold reached
    try:
        cur.execute("UPDATE goals SET saved = saved + %s WHERE goal_id=%s", (amount_val, goal_id))
        cur.execute("SELECT saved, target FROM goals WHERE goal_id=%s", (goal_id,))
        g = cur.fetchone()
        if g and g.get('saved') is not None and g.get('target') is not None:
            if float(g['saved']) >= float(g['target']):
                cur.execute("UPDATE goals SET status=%s WHERE goal_id=%s", ('completed', goal_id))
        mysql.connection.commit()
    except Exception as e:
        mysql.connection.rollback()
        cur.close()
        return jsonify({'status': 'error', 'message': 'Failed to update goal saved value: ' + str(e)}), 500

    cur.close()
    return jsonify({'status': 'success', 'message': 'Amount added to goal'}), 200


# ---------- GOAL: MONEY HISTORY ----------
@app.route('/goal_money_history', methods=['GET'])
def goal_money_history():
    user_id = request.args.get('user_id')
    goal_id = request.args.get('goal_id')
    if not all([user_id, goal_id]):
        return jsonify({'status': 'error', 'message': 'user_id and goal_id required'}), 400

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    try:
        cur.execute("""
            SELECT id, user_id, goal_id, amount, date, note, created_at
            FROM goal_savings
            WHERE user_id=%s AND goal_id=%s
            ORDER BY date DESC, created_at DESC
        """, (user_id, goal_id))
        rows = safe_fetchall(cur)
    except Exception:
        rows = []
    cur.close()
    return jsonify({'status': 'success', 'history': rows}), 200

# ---------- PREDICTIONS ----------
@app.route('/predictions', methods=['GET'])
def predictions():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'user_id required'}), 400

    cur = mysql.connection.cursor(MySQLdb.cursors.DictCursor)
    cur.execute("""
        SELECT DATE_FORMAT(date, '%%Y-%%m') AS month, SUM(amount) AS total
        FROM transactions
        WHERE user_id=%s AND type='expense'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 6
    """, (user_id,))
    rows = safe_fetchall(cur)
    cur.close()
    rows_chrono = list(reversed(rows))
    labels = [r['month'] for r in rows_chrono]
    actual = [int(r['total']) for r in rows_chrono]
    if not actual:
        return jsonify({'status': 'success', 'labels': [], 'actual': [], 'predicted': [], 'next_pred': 0}), 200

    avg = sum(actual) / len(actual)
    next_pred = int(round(avg * 1.05))
    predicted = actual[1:] + [next_pred] if len(actual) > 1 else [next_pred]

    return jsonify({
        'status': 'success',
        'labels': labels,
        'actual': actual,
        'predicted': predicted,
        'next_pred': next_pred
    }), 200

# ---------- HEALTH ----------
@app.route('/')
def home():
    return jsonify({'message': 'Finance Advisor Backend Running ✅'}), 200

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
