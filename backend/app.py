from flask import Flask, request, jsonify
from database import db
from config import Config
from models import Product, ImportJob
from tasks import import_products
import uuid
import os

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.before_first_request
def create_tables():
    db.create_all()
