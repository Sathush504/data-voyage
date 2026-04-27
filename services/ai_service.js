'use strict';
const db = require('../config/db');

/**
 * AI Service for Data Voyage
 * Simulates automated paper enrichment (summarization, tagging, etc.)
 * In a production app, this would call OpenAI, Gemini, or a local LLM.
 */
class AIService {
  async processPaper(paperId) {
    const paper = db.prepare('SELECT * FROM papers WHERE id = ?').get(paperId);
    if (!paper) return;

    // Simulate processing delay
    setTimeout(async () => {
      try {
        console.log(`[AI Service] Processing paper ${paperId}: ${paper.title}`);
        
        // Simulating AI generation
        const summary = `This research explores ${paper.domain} with a focus on its practical applications. The study provides a comprehensive analysis of the proposed methodology, highlighting its efficiency and scalability in modern data environments.`;
        
        const tags = paper.keywords 
          ? paper.keywords + ', AI-Generated, Insights' 
          : 'Research, Discovery, AI-Enriched';

        db.prepare(`
          UPDATE papers 
          SET ai_summary = ?, 
              ai_tags = ?, 
              ai_processing_status = 'completed' 
          WHERE id = ?
        `).run(summary, tags, paperId);

        console.log(`[AI Service] Completed processing paper ${paperId}`);
      } catch (err) {
        console.error(`[AI Service] Failed to process paper ${paperId}:`, err);
        db.prepare("UPDATE papers SET ai_processing_status = 'failed' WHERE id = ?").run(paperId);
      }
    }, 2000); // 2 second delay to simulate work
  }
}

module.exports = new AIService();
