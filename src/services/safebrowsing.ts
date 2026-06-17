import { config } from '../config';

class SafeBrowsingService {
  private apiKey: string;
  private bypass: boolean;
  private endpoint: string;

  constructor() {
    this.apiKey = config.safeBrowsingApiKey;
    this.bypass = config.bypassSafeBrowsing;
    this.endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${this.apiKey}`;
  }

  /**
   * Checks if a URL is safe. Returns true if safe, false if malware/phishing detected.
   */
  public async isUrlSafe(url: string): Promise<{ safe: boolean; reason?: string }> {
    if (this.bypass || !this.apiKey) {
      if (!this.apiKey) {
        console.warn(
          'Google Safe Browsing API key missing. Bypassing threat check (BYPASS_SAFE_BROWSING is active).'
        );
      }
      return { safe: true };
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client: {
            clientId: 'aegis-url-shortener',
            clientVersion: '1.0.0',
          },
          threatInfo: {
            threatTypes: [
              'MALWARE',
              'SOCIAL_ENGINEERING',
              'UNWANTED_SOFTWARE',
              'POTENTIALLY_HARMFUL_APPLICATION',
            ],
            platformTypes: ['ANY_PLATFORM'],
            threatEntryTypes: ['URL'],
            threatEntries: [{ url }],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Safe Browsing API responded with error status ${response.status}:`, errorText);
        // Fallback to true in production if Google service is failing, to maintain availability
        return { safe: true, reason: 'Google Safe Browsing API failure, allowed fallback' };
      }

      const data = await response.json();

      if (data && data.matches && data.matches.length > 0) {
        const match = data.matches[0];
        return {
          safe: false,
          reason: `Flagged as ${match.threatType} on ${match.platformType}`,
        };
      }

      return { safe: true };
    } catch (error) {
      console.error('Error calling Google Safe Browsing API:', error);
      // Fail-open strategy to prevent blocking redirection functionality if the service is unreachable
      return { safe: true, reason: 'Safe Browsing lookup connection error' };
    }
  }
}

export const safeBrowsing = new SafeBrowsingService();
export default safeBrowsing;
