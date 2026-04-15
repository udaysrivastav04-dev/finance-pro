# db_config.py
import os
from flask_mysqldb import MySQL

def init_db(app):
    # Set MYSQL_PASSWORD (and optionally other vars) as environment variables,
    # or edit the defaults below for local development only.
    app.config['MYSQL_HOST']        = os.environ.get('MYSQL_HOST', 'localhost')
    app.config['MYSQL_USER']        = os.environ.get('MYSQL_USER', 'root')
    app.config['MYSQL_PASSWORD']    = os.environ.get('MYSQL_PASSWORD', 'root@bs6SQL')
    app.config['MYSQL_DB']          = os.environ.get('MYSQL_DB', 'finance_advisor')
    app.config['MYSQL_CURSORCLASS'] = 'DictCursor'
    return MySQL(app)
