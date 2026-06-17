import crypto from 'crypto';
import { config } from '../config';

class CryptoService {
  private key: Buffer;

  constructor() {
    // Master key must be 32 bytes (64 hex characters)
    this.key = Buffer.from(config.masterEncryptionKey, 'hex');
    
    if (this.key.length !== 32) {
      // Fallback/derive a 32-byte key using PBKDF2 if the input is not exactly 32 bytes of hex
      console.warn('WARNING: Deriving 32-byte key from MASTER_ENCRYPTION_KEY using pbkdf2 fallback...');
      this.key = crypto.pbkdf2Sync(config.masterEncryptionKey, 'aegis_salt', 10000, 32, 'sha256');
    }
  }

  /**
   * Encrypts a URL using AES-256-GCM
   */
  public encrypt(text: string): { ciphertext: string; iv: string; authTag: string } {
    // Generate a 12-byte IV for GCM mode
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag,
    };
  }

  /**
   * Decrypts an encrypted URL using AES-256-GCM and verifies its integrity
   */
  public decrypt(ciphertext: string, ivHex: string, authTagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generates a secure, random API Key for SaaS users
   */
  public generateApiKey(): string {
    return 'aegis_live_' + crypto.randomBytes(24).toString('hex');
  }
}

export const cryptoService = new CryptoService();
export default cryptoService;
