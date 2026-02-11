/**
 * FileOutput - File-based audit output with rotation
 * 
 * Writes audit events to a file with automatic rotation when size limit is reached.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditEvent, AuditOutput } from './TealAudit';

/**
 * Configuration for FileOutput
 */
export interface FileOutputConfig {
  /** Path to the audit log file */
  filePath: string;
  
  /** Maximum file size in bytes before rotation (default: 100MB) */
  maxSize?: number;
  
  /** Whether to create parent directories if they don't exist (default: true) */
  createDirs?: boolean;
}

/**
 * File output for audit events with automatic rotation
 */
export class FileOutput implements AuditOutput {
  private stream: fs.WriteStream;
  private currentSize: number = 0;
  private maxSize: number;
  private filePath: string;

  constructor(config: string | FileOutputConfig) {
    // Support both string path and config object
    if (typeof config === 'string') {
      this.filePath = config;
      this.maxSize = 100 * 1024 * 1024; // 100MB default
      this.ensureDirectoryExists(this.filePath);
    } else {
      this.filePath = config.filePath;
      this.maxSize = config.maxSize || 100 * 1024 * 1024;
      
      if (config.createDirs !== false) {
        this.ensureDirectoryExists(this.filePath);
      }
    }

    // Get current file size if it exists
    if (fs.existsSync(this.filePath)) {
      const stats = fs.statSync(this.filePath);
      this.currentSize = stats.size;
    }

    // Create write stream in append mode
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
  }

  /**
   * Write an audit event to the file
   */
  write(event: AuditEvent): void {
    const line = JSON.stringify(event) + '\n';
    const lineSize = Buffer.byteLength(line, 'utf8');

    // Check if rotation is needed
    if (this.currentSize + lineSize > this.maxSize) {
      this.rotate();
    }

    // Write to file (synchronous to ensure it's written immediately)
    this.stream.write(line);
    this.currentSize += lineSize;
  }

  /**
   * Close the file stream
   */
  close(): void {
    if (this.stream) {
      this.stream.end();
      // Wait for stream to finish
      this.stream.once('finish', () => {
        // Stream closed
      });
    }
  }

  /**
   * Flush the stream (for testing)
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.stream.writableNeedDrain) {
        this.stream.once('drain', () => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Rotate the log file
   */
  private rotate(): void {
    // Close current stream
    this.stream.end();

    // Generate rotated filename with timestamp
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const ext = path.extname(this.filePath);
    const base = this.filePath.slice(0, -ext.length);
    const rotatedPath = `${base}.${timestamp}${ext}`;

    // Rename current file
    fs.renameSync(this.filePath, rotatedPath);

    // Create new stream
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    this.currentSize = 0;
  }

  /**
   * Ensure parent directory exists
   */
  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
