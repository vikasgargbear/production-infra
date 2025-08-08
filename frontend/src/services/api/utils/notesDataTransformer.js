/**
 * Notes Data Transformer
 * Utility functions for transforming notes data between frontend and backend formats
 */

export const notesDataTransformer = {
  /**
   * Transform note data for API submission
   */
  toAPI: (noteData) => ({
    ...noteData,
    amount: parseFloat(noteData.amount) || 0,
    date: noteData.date || new Date().toISOString().split('T')[0],
  }),

  /**
   * Transform API response to frontend format
   */
  fromAPI: (apiData) => ({
    ...apiData,
    amount: apiData.amount?.toString() || '0',
    date: apiData.date || new Date().toISOString().split('T')[0],
  }),
};

export default notesDataTransformer;