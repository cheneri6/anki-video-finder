// --- WEB WORKER BACKGROUND SCRIPT ---
// Keeps search execution and parsing off the main UI Thread for 50MB+ datasets

let cards = [];
let userPreferences = {
  examFocus: 'step1', 
  enabledServices: {
    'Boards & Beyond': true,
    'Pathoma': true,
    'Sketchy Micro': true,
    'Sketchy Pharm': true
  }
};

function detectDelimiter(text) {
  const lines = text.split('\n').slice(0, 50);
  let commaCount = 0;
  let tabCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('#')) {
      commaCount += (l.match(/,/g) || []).length;
      tabCount += (l.match(/\t/g) || []).length;
    }
  }
  return tabCount > commaCount ? '\t' : ',';
}

function parseData(text) {
  const delimiter = detectDelimiter(text);
  const result = [];
  let row = [];
  let startValue = 0;
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      let val = text.substring(startValue, i);
      if (val.length >= 2 && val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
        val = val.substring(1, val.length - 1).replace(/""/g, '"');
      }
      row.push(val);
      startValue = i + 1;
    } else if (c === '\n' && !inQuotes) {
      let val = text.substring(startValue, i);
      if (val.length > 0 && val.charCodeAt(val.length - 1) === 13) { 
        val = val.substring(0, val.length - 1);
      }
      if (val.length >= 2 && val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
        val = val.substring(1, val.length - 1).replace(/""/g, '"');
      }
      row.push(val);
      if (row.length > 0) result.push(row);
      row = [];
      startValue = i + 1;
    }
  }
  if (startValue < text.length) {
    let val = text.substring(startValue);
    if (val.length >= 2 && val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
      val = val.substring(1, val.length - 1).replace(/""/g, '"');
    }
    row.push(val);
    result.push(row);
  }
  return result;
}

self.onmessage = function(e) {
  const { type, payload } = e.data;
  
  if (type === 'LOAD_CSV') {
    try {
      const rows = parseData(payload);
      cards = [];
      
      let tagsColIdx = -1;
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        if (rows[i][0] && typeof rows[i][0] === 'string' && rows[i][0].startsWith('#tags column:')) {
          const colNum = parseInt(rows[i][0].split(':')[1], 10);
          if (!isNaN(colNum)) tagsColIdx = colNum - 1;
          break;
        }
      }
      
      if (tagsColIdx === -1) {
        for (let i = 0; i < Math.min(50, rows.length); i++) {
          const r = rows[i];
          if (r[0] && typeof r[0] === 'string' && r[0].startsWith('#')) continue;
          for (let j = 0; j < r.length; j++) {
            if (r[j] && typeof r[j] === 'string' && r[j].includes('#AK_')) {
              tagsColIdx = j;
              break;
            }
          }
          if (tagsColIdx !== -1) break;
        }
      }
      
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.length < 2 || (r[0] && typeof r[0] === 'string' && r[0].startsWith('#'))) continue; 
        
        let tags = '';
        if (tagsColIdx !== -1 && tagsColIdx < r.length) {
          tags = r[tagsColIdx];
        } else {
          tags = r[r.length - 1] || ''; 
        }

        cards.push({
          text: r[0] || '',
          extra: r[1] || '',
          tags: tags || ''
        });
      }
      self.postMessage({ type: 'LOAD_COMPLETE', count: cards.length });
    } catch (error) {
      self.postMessage({ type: 'ERROR', payload: error.message });
    }
  } 
  
  else if (type === 'UPDATE_PREFERENCES') {
    userPreferences = payload;
  }
  
  else if (type === 'SEARCH') {
    const { conceptGroups } = payload;
    let allMatches = [];
    const lowerConceptGroups = conceptGroups.map(group => group.map(k => k.toLowerCase()));
    
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      
      const hasStep1Tag = c.tags.toLowerCase().includes('step1');
      const hasStep2Tag = c.tags.toLowerCase().includes('step2');
      
      if (userPreferences.examFocus === 'step1' && !hasStep1Tag && hasStep2Tag) continue;
      if (userPreferences.examFocus === 'step2' && !hasStep2Tag && hasStep1Tag) continue;

      let score = 0;
      let matchCount = 0;
      const searchPool = (c.text + " " + c.extra).toLowerCase();
      
      for (let j = 0; j < lowerConceptGroups.length; j++) {
        let groupMatched = false;
        const group = lowerConceptGroups[j];
        for (let k = 0; k < group.length; k++) {
          const term = group[k];
          if (searchPool.includes(term)) {
            groupMatched = true;
            score += term.length;
          }
        }
        if (groupMatched) matchCount++;
      }
      
      if (matchCount > 0) {
        allMatches.push({ card: c, score, matchCount });
      }
    }
    
    allMatches.sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return b.score - a.score;
    });

    if (allMatches.length > 0) {
       const highestMatchCount = allMatches[0].matchCount;
       const topTier = allMatches.filter(m => m.matchCount === highestMatchCount);
       self.postMessage({ type: 'SEARCH_COMPLETE', results: topTier.slice(0, 50) });
    } else {
       self.postMessage({ type: 'SEARCH_COMPLETE', results: [] });
    }
  }
  
  else if (type === 'SEARCH_SYLLABUS') {
    const { categories } = payload;
    let syllabusResults = {};

    categories.forEach(cat => {
      let catMatches = new Map();

      cat.searchQueries.forEach(query => {
         const lowerConceptGroups = query.requiredConcepts.map(group => group.map(k => k.toLowerCase()));
         
         for (let i = 0; i < cards.length; i++) {
            const c = cards[i];
            
            const hasStep1Tag = c.tags.toLowerCase().includes('step1');
            const hasStep2Tag = c.tags.toLowerCase().includes('step2');
            if (userPreferences.examFocus === 'step1' && !hasStep1Tag && hasStep2Tag) continue;
            if (userPreferences.examFocus === 'step2' && !hasStep2Tag && hasStep1Tag) continue;

            let matchCount = 0;
            const searchPool = (c.text + " " + c.extra).toLowerCase();

            for (let j = 0; j < lowerConceptGroups.length; j++) {
              let groupMatched = false;
              const group = lowerConceptGroups[j];
              for (let k = 0; k < group.length; k++) {
                if (searchPool.includes(group[k])) {
                  groupMatched = true;
                  break;
                }
              }
              if (groupMatched) matchCount++;
            }

            if (matchCount === lowerConceptGroups.length && lowerConceptGroups.length > 0) {
               if (!catMatches.has(c.text)) {
                  catMatches.set(c.text, { card: c, score: 1 });
               }
            }
         }
      });

      syllabusResults[cat.name] = Array.from(catMatches.values()).slice(0, 40);
    });

    self.postMessage({ type: 'SEARCH_SYLLABUS_COMPLETE', results: syllabusResults });
  }
  
  else if (type === 'CLEAR_CSV') {
    cards = [];
  }
};