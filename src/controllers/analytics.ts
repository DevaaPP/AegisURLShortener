import { Request, Response } from 'express';
import { db } from '../services/db';

/**
 * Retrieve comprehensive aggregated analytics for a specific shortcode
 */
export async function getLinkAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // 1. Verify that the link exists and is owned by the requesting user
    const linkResult = await db.query(
      'SELECT id, short_code, title, created_at, is_active, expires_at FROM links WHERE short_code = $1 AND created_by = $2 LIMIT 1',
      [code, userId]
    );

    if (linkResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Short link not found or you do not have permission to view its analytics.',
      });
      return;
    }

    const link = linkResult.rows[0];

    // 2. Fetch Aggregated Metrics concurrently in PostgreSQL
    const totalClicksPromise = db.query(
      'SELECT COUNT(*)::int as count FROM click_analytics WHERE short_code = $1',
      [code]
    );

    const countryBreakdownPromise = db.query(
      'SELECT country, COUNT(*)::int as count FROM click_analytics WHERE short_code = $1 GROUP BY country ORDER BY count DESC LIMIT 10',
      [code]
    );

    const deviceBreakdownPromise = db.query(
      'SELECT device, COUNT(*)::int as count FROM click_analytics WHERE short_code = $1 GROUP BY device ORDER BY count DESC',
      [code]
    );

    const osBreakdownPromise = db.query(
      'SELECT os, COUNT(*)::int as count FROM click_analytics WHERE short_code = $1 GROUP BY os ORDER BY count DESC',
      [code]
    );

    const browserBreakdownPromise = db.query(
      'SELECT browser, COUNT(*)::int as count FROM click_analytics WHERE short_code = $1 GROUP BY browser ORDER BY count DESC',
      [code]
    );

    const timelinePromise = db.query(
      `SELECT DATE_TRUNC('day', clicked_at) as date, COUNT(*)::int as count 
       FROM click_analytics 
       WHERE short_code = $1 
       GROUP BY date 
       ORDER BY date ASC 
       LIMIT 30`,
      [code]
    );

    const recentClicksPromise = db.query(
      `SELECT clicked_at, ip_address, country, device, os, browser, referrer 
       FROM click_analytics 
       WHERE short_code = $1 
       ORDER BY clicked_at DESC 
       LIMIT 10`,
      [code]
    );

    // Wait for all queries to complete
    const [
      totalClicksRes,
      countryRes,
      deviceRes,
      osRes,
      browserRes,
      timelineRes,
      recentRes,
    ] = await Promise.all([
      totalClicksPromise,
      countryBreakdownPromise,
      deviceBreakdownPromise,
      osBreakdownPromise,
      browserBreakdownPromise,
      timelinePromise,
      recentClicksPromise,
    ]);

    res.status(200).json({
      success: true,
      link: {
        short_code: link.short_code,
        title: link.title,
        created_at: link.created_at,
        is_active: link.is_active,
        expires_at: link.expires_at,
      },
      metrics: {
        total_clicks: totalClicksRes.rows[0]?.count || 0,
        breakdown: {
          countries: countryRes.rows,
          devices: deviceRes.rows,
          operating_systems: osRes.rows,
          browsers: browserRes.rows,
        },
        timeline: timelineRes.rows.map((row) => ({
          date: new Date(row.date).toISOString().split('T')[0],
          clicks: row.count,
        })),
        recent_clicks: recentRes.rows,
      },
    });
  } catch (error) {
    console.error('Analytics Fetch Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}

/**
 * List all links owned by the authenticated SaaS user, including click totals
 */
export async function getUserLinks(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await db.query(
      `SELECT l.id, l.short_code, l.title, l.expires_at, l.allow_single_use, l.is_active, l.created_at,
              COALESCE(c.clicks, 0)::int as total_clicks
       FROM links l
       LEFT JOIN (
         SELECT short_code, COUNT(*) as clicks FROM click_analytics GROUP BY short_code
       ) c ON l.short_code = c.short_code
       WHERE l.created_by = $1
       ORDER BY l.created_at DESC;`,
      [userId]
    );

    res.status(200).json({
      success: true,
      links: result.rows,
    });
  } catch (error) {
    console.error('Fetch User Links Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
}
