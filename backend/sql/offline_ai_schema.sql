-- Tables for local offline AI assistant
CREATE TABLE IF NOT EXISTS ai_documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  filename VARCHAR(255) NOT NULL,
  path TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  last_error TEXT NULL,
  processed_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_chats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  question TEXT NOT NULL,
  answer LONGTEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Optional metadata table (mirrors what Python FAISS index stores)
CREATE TABLE IF NOT EXISTS ai_chunks_meta (
  chunk_id VARCHAR(255) PRIMARY KEY,
  document_id BIGINT NOT NULL,
  meta JSON,
  text LONGTEXT NOT NULL
);
