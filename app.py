from flask import Flask, render_template, request, jsonify
import sqlite3
import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup
import os
import uuid
import warnings

warnings.filterwarnings('ignore', category=UserWarning, module='ebooklib')
warnings.filterwarnings('ignore', category=FutureWarning, module='ebooklib')

app = Flask(__name__)
app.secret_key = 'epub_reader_secret_key'

class EPUBReader:
    def __init__(self):
        self.init_db()
    
    def init_db(self):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS books
                     (id TEXT PRIMARY KEY, title TEXT, author TEXT, chapters INTEGER)''')
        c.execute('''CREATE TABLE IF NOT EXISTS chapters
                     (book_id TEXT, chapter_num INTEGER, title TEXT, content TEXT, word_count INTEGER,
                      PRIMARY KEY (book_id, chapter_num))''')
        c.execute('''CREATE TABLE IF NOT EXISTS images
                     (book_id TEXT, filename TEXT, data BLOB,
                      PRIMARY KEY (book_id, filename))''')
        c.execute('''CREATE TABLE IF NOT EXISTS reading_progress
                     (book_id TEXT, chapter INTEGER, page INTEGER, 
                      PRIMARY KEY (book_id))''')
        
        # Drop old bookmarks table and recreate with new schema
        # c.execute('DROP TABLE IF EXISTS bookmarks')
        c.execute('''CREATE TABLE IF NOT EXISTS bookmarks
                     (id INTEGER PRIMARY KEY, book_id TEXT, chapter INTEGER, 
                      page INTEGER, chapter_title TEXT, bookmark_title TEXT, 
                      description TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        conn.commit()
        conn.close()
    
    def parse_epub(self, file_path):
        book = epub.read_epub(file_path, options={'ignore_ncx': True})
        
        # Extract metadata
        title = book.get_metadata('DC', 'title')[0][0] if book.get_metadata('DC', 'title') else 'Unknown'
        author = book.get_metadata('DC', 'creator')[0][0] if book.get_metadata('DC', 'creator') else 'Unknown'
        
        book_id = str(uuid.uuid4())
        
        # Extract and store images
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("DELETE FROM images WHERE book_id = ?", (book_id,))
        
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_IMAGE:
                # Store with original filename
                original_name = item.get_name().split('/')[-1]
                c.execute("INSERT INTO images VALUES (?, ?, ?)",
                         (book_id, original_name, item.get_content()))
                # Also store with full path as filename for nested images
                full_path_name = item.get_name().replace('/', '_').replace('\\', '_')
                if full_path_name != original_name:
                    c.execute("INSERT OR IGNORE INTO images VALUES (?, ?, ?)",
                             (book_id, full_path_name, item.get_content()))
        
        # Extract chapters and fix image paths
        chapters = []
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_DOCUMENT:
                soup = BeautifulSoup(item.get_content(), 'html.parser')
                
                # Fix image src paths
                for img in soup.find_all('img'):
                    src = img.get('src')
                    if src:
                        # Try multiple filename variations
                        original_name = src.split('/')[-1]
                        full_path_name = src.replace('/', '_').replace('\\', '_')
                        img['src'] = f'/image/{book_id}/{original_name}'
                        img['onerror'] = f"this.src='/image/{book_id}/{full_path_name}'"
                        img['style'] = 'max-width: 100%; height: auto;'
                
                text = soup.get_text()
                if text.strip():
                    chapters.append({
                        'title': self.extract_title(soup),
                        'content': str(soup),
                        'word_count': len(text.split())
                    })
        
        # Save to database
        c.execute("INSERT OR REPLACE INTO books VALUES (?, ?, ?, ?)", 
                 (book_id, title, author, len(chapters)))
        
        # Store chapters in database
        c.execute("DELETE FROM chapters WHERE book_id = ?", (book_id,))
        for i, chapter in enumerate(chapters):
            c.execute("INSERT INTO chapters VALUES (?, ?, ?, ?, ?)",
                     (book_id, i, chapter['title'], chapter['content'], chapter['word_count']))
        
        conn.commit()
        conn.close()
        
        return {
            'id': book_id,
            'title': title,
            'author': author,
            'chapter_count': len(chapters)
        }
    
    def extract_title(self, soup):
        title_tag = soup.find('title')
        if title_tag:
            return title_tag.get_text().strip()
        
        for tag in ['h1', 'h2', 'h3']:
            header = soup.find(tag)
            if header:
                return header.get_text().strip()
        
        return 'Chapter'
    
    def get_reading_progress(self, book_id):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("SELECT chapter, page FROM reading_progress WHERE book_id = ?", (book_id,))
        result = c.fetchone()
        conn.close()
        return result if result else (0, 1)
    
    def save_progress(self, book_id, chapter, page):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("INSERT OR REPLACE INTO reading_progress VALUES (?, ?, ?)", 
                 (book_id, chapter, page))
        conn.commit()
        conn.close()
    
    def add_bookmark(self, book_id, chapter, page, chapter_title, bookmark_title, description):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("INSERT INTO bookmarks (book_id, chapter, page, chapter_title, bookmark_title, description) VALUES (?, ?, ?, ?, ?, ?)",
                 (book_id, chapter, page, chapter_title, bookmark_title, description))
        conn.commit()
        conn.close()
    
    def get_bookmarks(self, book_id):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("SELECT id, chapter, page, chapter_title, bookmark_title, description, created_at FROM bookmarks WHERE book_id = ? ORDER BY created_at DESC", (book_id,))
        result = c.fetchall()
        conn.close()
        return result
    
    def get_all_bookmarks(self):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("""SELECT b.id, b.chapter, b.page, b.chapter_title, b.bookmark_title, b.description, 
                            b.created_at, bk.title as book_title, bk.author, b.book_id
                     FROM bookmarks b 
                     JOIN books bk ON b.book_id = bk.id 
                     ORDER BY b.created_at DESC""")
        result = c.fetchall()
        conn.close()
        return result
    
    def delete_bookmark(self, bookmark_id):
        conn = sqlite3.connect('reader.db')
        c = conn.cursor()
        c.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
        conn.commit()
        conn.close()

reader = EPUBReader()
current_book_id = None

@app.route('/current_book')
def get_current_book():
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("SELECT book_id FROM reading_progress ORDER BY rowid DESC LIMIT 1")
    result = c.fetchone()
    conn.close()
    
    if result:
        return load_book(result[0])
    return jsonify({'error': 'No book loaded'})

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/manage')
def manage():
    return render_template('manage.html')

@app.route('/bookmarks_page')
def bookmarks_page():
    return render_template('bookmarks.html')

@app.route('/all_bookmarks')
def get_all_bookmarks():
    bookmarks = reader.get_all_bookmarks()
    return jsonify([{
        'id': row[0], 'chapter': row[1], 'page': row[2], 'chapter_title': row[3],
        'bookmark_title': row[4], 'description': row[5], 'created_at': row[6],
        'book_title': row[7], 'author': row[8], 'book_id': row[9]
    } for row in bookmarks])

@app.route('/delete_bookmark/<int:bookmark_id>', methods=['DELETE'])
def delete_bookmark(bookmark_id):
    reader.delete_bookmark(bookmark_id)
    return jsonify({'success': True})

@app.route('/books')
def get_books():
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("SELECT id, title, author, chapters FROM books")
    books = [{'id': row[0], 'title': row[1], 'author': row[2], 'chapters': row[3]} for row in c.fetchall()]
    conn.close()
    return jsonify(books)

@app.route('/load_book/<book_id>')
def load_book(book_id):
    global current_book_id
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("SELECT title, author, chapters FROM books WHERE id = ?", (book_id,))
    result = c.fetchone()
    conn.close()
    
    if result:
        current_book_id = book_id
        progress = reader.get_reading_progress(book_id)
        return jsonify({
            'id': book_id,
            'title': result[0],
            'author': result[1],
            'chapter_count': result[2],
            'last_chapter': progress[0],
            'last_page': progress[1]
        })
    return jsonify({'error': 'Book not found'})

@app.route('/upload', methods=['POST'])
def upload_epub():
    global current_book_id
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'})
    
    if file and file.filename.endswith('.epub'):
        file_path = f"uploads/{file.filename}"
        os.makedirs('uploads', exist_ok=True)
        file.save(file_path)
        
        try:
            book_data = reader.parse_epub(file_path)
            current_book_id = book_data['id']
            os.remove(file_path)
            return jsonify(book_data)
        except Exception as e:
            return jsonify({'error': str(e)})
    
    return jsonify({'error': 'Invalid file format'})

@app.route('/chapter/<book_id>/<int:chapter_num>')
def get_chapter(book_id, chapter_num):
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("SELECT title, content, word_count FROM chapters WHERE book_id = ? AND chapter_num = ?",
             (book_id, chapter_num))
    result = c.fetchone()
    conn.close()
    
    if not result:
        return jsonify({'error': 'Chapter not found'})
    
    title, content, word_count = result
    words_per_page = 250
    total_pages = max(1, (word_count + words_per_page - 1) // words_per_page)
    
    return jsonify({
        'title': title,
        'content': content,
        'total_pages': total_pages,
        'word_count': word_count
    })

@app.route('/progress', methods=['POST'])
def save_progress():
    data = request.json
    book_id = data.get('book_id')
    if book_id:
        reader.save_progress(book_id, data['chapter'], data['page'])
        return jsonify({'success': True})
    return jsonify({'error': 'No book loaded'})

@app.route('/bookmark', methods=['POST'])
def add_bookmark():
    data = request.json
    book_id = data.get('book_id')
    if book_id:
        reader.add_bookmark(book_id, data['chapter'], data['page'], 
                          data['chapter_title'], data['bookmark_title'], data['description'])
        return jsonify({'success': True})
    return jsonify({'error': 'No book loaded'})

@app.route('/bookmarks/<book_id>')
def get_bookmarks(book_id):
    bookmarks = reader.get_bookmarks(book_id)
    return jsonify(bookmarks)

@app.route('/toc/<book_id>')
def get_toc(book_id):
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("SELECT chapter_num, title FROM chapters WHERE book_id = ? ORDER BY chapter_num",
             (book_id,))
    chapters = [{'index': row[0], 'title': row[1]} for row in c.fetchall()]
    conn.close()
    
    return jsonify(chapters)

@app.route('/delete_book/<book_id>', methods=['DELETE'])
def delete_book(book_id):
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("DELETE FROM books WHERE id = ?", (book_id,))
    c.execute("DELETE FROM chapters WHERE book_id = ?", (book_id,))
    c.execute("DELETE FROM reading_progress WHERE book_id = ?", (book_id,))
    c.execute("DELETE FROM bookmarks WHERE book_id = ?", (book_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/image/<book_id>/<filename>')
def get_image(book_id, filename):
    from flask import Response
    conn = sqlite3.connect('reader.db')
    c = conn.cursor()
    c.execute("SELECT data FROM images WHERE book_id = ? AND filename = ?", (book_id, filename))
    result = c.fetchone()
    conn.close()
    
    if result:
        # Detect image type from data
        data = result[0]
        if data.startswith(b'\x89PNG'):
            mimetype = 'image/png'
        elif data.startswith(b'\xff\xd8'):
            mimetype = 'image/jpeg'
        elif data.startswith(b'GIF'):
            mimetype = 'image/gif'
        else:
            mimetype = 'image/jpeg'
        return Response(data, mimetype=mimetype)
    return '', 404

if __name__ == '__main__':
    app.run(debug=True)