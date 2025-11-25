#!/usr/bin/env python3
"""
Python EPUB Reader - Simple script to run the application
"""

import subprocess
import sys
import os

def install_requirements():
    """Install required packages"""
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
        print("✅ Dependencies installed successfully")
    except subprocess.CalledProcessError:
        print("❌ Failed to install dependencies")
        sys.exit(1)

def run_app():
    """Run the Flask application"""
    from app import app
    print("🚀 Starting Python EPUB Reader...")
    print("📖 Open http://localhost:5000 in your browser")
    app.run(debug=True, host='0.0.0.0', port=5000)

if __name__ == '__main__':
    if not os.path.exists('reader.db'):
        print("📚 First time setup - installing dependencies...")
        install_requirements()
    
    run_app()