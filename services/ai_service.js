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
        
        // Simulating AI generation for summary
        const summary = `This research explores ${paper.domain} with a focus on its practical applications. The study provides a comprehensive analysis of the proposed methodology, highlighting its efficiency and scalability in modern data environments.`;
        
        // Simulating AI Detection (Score between 5 and 45 for most, sometimes higher)
        const aiScore = Math.floor(Math.random() * 40) + 5;
        const aiIsDetected = aiScore > 80 ? 1 : 0; // Simulate rare detection

        // Simulating Keyword Extraction based on domain
        const domainKeywords = {
          'Machine Learning': ['Neural Networks', 'Backpropagation', 'Gradient Descent', 'Overfitting'],
          'Statistics': ['Hypothesis Testing', 'P-Value', 'Standard Deviation', 'Regression'],
          'NLP': ['Transformers', 'Tokenization', 'Sentiment Analysis', 'BERT'],
          'Computer Vision': ['CNN', 'Segmentation', 'Object Detection', 'Image Processing'],
          'Bioinformatics': ['Genomics', 'Sequencing', 'Protein Folding', 'BLAST'],
          'Robotics': ['Kinematics', 'Control Theory', 'Path Planning', 'Sensors']
        };

        const autoKeywords = (domainKeywords[paper.domain] || ['Research', 'Analysis', 'Development']).join(', ');

        const tags = paper.keywords 
          ? paper.keywords + ', AI-Enriched' 
          : 'Research, Discovery, AI-Enriched';

        db.prepare(`
          UPDATE papers 
          SET ai_summary = ?, 
              ai_tags = ?, 
              ai_keywords = ?,
              ai_score = ?,
              ai_is_detected = ?,
              ai_processing_status = 'completed' 
          WHERE id = ?
        `).run(summary, tags, autoKeywords, aiScore, aiIsDetected, paperId);

        console.log(`[AI Service] Completed processing paper ${paperId} (AI Score: ${aiScore}%)`);
      } catch (err) {
        console.error(`[AI Service] Failed to process paper ${paperId}:`, err);
        db.prepare("UPDATE papers SET ai_processing_status = 'failed' WHERE id = ?").run(paperId);
      }
    }, 2000); // 2 second delay to simulate work
  }
}

module.exports = new AIService();
