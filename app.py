from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    """Serve the main HTML page"""
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    """Serve static files (JS, CSS, video, JSON)"""
    return send_from_directory('static', filename)

@app.route('/result/<path:filename>')
def result_files(filename):
    """Serve result files (processed video, bbox JSON)"""
    return send_from_directory('result', filename)

if __name__ == '__main__':
    # Ensure result directory exists
    os.makedirs('result', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    os.makedirs('templates', exist_ok=True)
    
    print("Starting Flask server...")
    print("Open http://localhost:5000 in your browser")
    app.run(debug=True, host='0.0.0.0', port=5000)
