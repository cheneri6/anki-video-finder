import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Video, BookOpen, Layers, 
  CheckCircle, Loader2, PlayCircle,
  Sparkles, BrainCircuit, MessageSquare, X, AlignLeft, Trash2,
  ChevronDown, ChevronUp, Settings, Sliders, Key, HelpCircle, Filter, CheckSquare, Square
} from 'lucide-react';

const DEFAULT_DECK_URL = "/api/deck";

// --- INLINE BACKGROUND WEB WORKER ENGINE ---
// Keeps search execution off the main UI Thread to avoid performance stuttering
const workerBlobCode = `
  let cards = [];
  let userPreferences = {
    examFocus: 'step1', 
    enabledServices: {}
  };

  function detectDelimiter(text) {
    const lines = text.split('\\n').slice(0, 50);
    let commaCount = 0;
    let tabCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.startsWith('#')) {
        commaCount += (l.match(/,/g) || []).length;
        tabCount += (l.match(/\\t/g) || []).length;
      }
    }
    return tabCount > commaCount ? '\\t' : ',';
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
      } else if (c === '\\n' && !inQuotes) {
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

  function cleanResourceName(raw) {
    const resourceMap = {
      'B&B': 'Boards & Beyond',
      'SketchyMicro': 'Sketchy Micro',
      'SketchyPharm': 'Sketchy Pharm',
      'SketchyPath': 'Sketchy Pathology',
      'SketchyAnatomy': 'Sketchy Anatomy',
      'SketchyBiochem': 'Sketchy Biochem',
      'SketchyBiostats/Epidemiology': 'Sketchy Biostats/Epidemiology',
      'SketchyImmunology': 'Sketchy Immunology',
      'SketchyPhysiology': 'Sketchy Physiology',
      'DirtyMedicine': 'Dirty Medicine',
      'FirstAid': 'First Aid',
      'NinjaNerd': 'Ninja Nerd',
      'DivineIntervention': 'Divine Intervention',
      'SketchyFM': 'Sketchy Family Medicine',
      'SketchyIM': 'Sketchy Internal Medicine',
      'SketchyNeurology': 'Sketchy Neurology',
      'SketchyOBGYN': 'Sketchy OBGYN',
      'SketchyPeds': 'Sketchy Pediatrics',
      'SketchyPsych': 'Sketchy Psychiatry',
      'SketchySurgery': 'Sketchy Surgery',
      'Low/HighYield': 'Low/High Yield',
      'USMLERx': 'USMLE Rx',
      'OME': 'OnlineMedEd',
      'OME_banner': 'OnlineMedEd Banner',
      'Resources_by_rotation': 'Resources by Rotation'
    };
    return resourceMap[raw] || raw;
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
        
        let discoveredStep1Resources = new Set();
        let discoveredStep2Resources = new Set();
        
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (r.length < 2 || (r[0] && typeof r[0] === 'string' && r[0].startsWith('#'))) continue; 
          
          let tags = '';
          if (tagsColIdx !== -1 && tagsColIdx < r.length) {
            tags = r[tagsColIdx];
          } else {
            tags = r[r.length - 1] || ''; 
          }

          const tagList = tags.split(' ');
          tagList.forEach(t => {
            if (!t) return;
            const parts = t.split('::');
            
            const step1Idx = parts.findIndex(p => p.toLowerCase().includes('step1'));
            if (step1Idx !== -1 && step1Idx + 1 < parts.length) {
              let res = parts[step1Idx + 1].replace(/^#/, '');
              if (res && !res.startsWith('^') && !res.startsWith('!') && res !== 'Subjects') {
                discoveredStep1Resources.add(cleanResourceName(res));
              }
            }
            
            const step2Idx = parts.findIndex(p => p.toLowerCase().includes('step2'));
            if (step2Idx !== -1 && step2Idx + 1 < parts.length) {
              let res = parts[step2Idx + 1].replace(/^#/, '');
              if (res && !res.startsWith('^') && !res.startsWith('!') && res !== 'Subjects') {
                discoveredStep2Resources.add(cleanResourceName(res));
              }
            }
          });

          cards.push({
            text: r[0] || '',
            extra: r[1] || '',
            tags: tags || ''
          });
        }

        self.postMessage({ 
          type: 'LOAD_COMPLETE', 
          count: cards.length,
          step1Resources: Array.from(discoveredStep1Resources).sort(),
          step2Resources: Array.from(discoveredStep2Resources).sort()
        });
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
`;

// --- INDEXED DB SERVICES FOR OFFLINE STORAGE ---
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AnkiDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveFileToDB = async (fileText) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const request = store.put(fileText, 'csvData');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const loadFileFromDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const request = store.get('csvData');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const clearFileFromDB = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    const request = store.delete('csvData');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export default function App() {
  const [worker, setWorker] = useState(null);
  const [csvStatus, setCsvStatus] = useState('idle'); 
  const [cardCount, setCardCount] = useState(0);
  const [prompt, setPrompt] = useState('');
  
  // Custom API Key and Settings State
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('anki_gemini_api_key') || "");
  const [showSettings, setShowSettings] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  
  // Dynamic resource sets loaded directly from card tags scanning
  const [step1Resources, setStep1Resources] = useState([]);
  const [step2Resources, setStep2Resources] = useState([]);
  
  const [preferences, setPreferences] = useState({
    examFocus: 'step1', 
    enabledServices: {}, 
    showYieldTags: true 
  });
  const [saveToast, setSaveToast] = useState(false);
  
  // Search State
  const [searchStatus, setSearchStatus] = useState('idle'); 
  const [searchMode, setSearchMode] = useState('normal'); 
  const [results, setResults] = useState([]); 
  const [syllabusResults, setSyllabusResults] = useState({}); 
  
  const [errorMsg, setErrorMsg] = useState('');
  const [extractedConcepts, setExtractedConcepts] = useState([]); 
  const [extractedSyllabus, setExtractedSyllabus] = useState(null); 
  
  // MULTI-SELECT ARRAY AND EXPLICIT SECTION ACCORDION CONTROLS
  const [selectedVideoFilters, setSelectedVideoFilters] = useState([]); 
  const [isSyllabusLogicExpanded, setIsSyllabusLogicExpanded] = useState(true);

  // AI Features State
  const [summaryStatus, setSummaryStatus] = useState('idle');
  const [aiSummary, setAiSummary] = useState('');
  const [quizStatus, setQuizStatus] = useState('idle');
  const [aiQuiz, setAiQuiz] = useState(null);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [cardExplanations, setCardExplanations] = useState({});
  
  const fileInputRef = useRef(null);

  // Load preferences from local storage on startup
  useEffect(() => {
    const localPrefs = localStorage.getItem('anki_video_finder_prefs');
    if (localPrefs) {
      try {
        const parsed = JSON.parse(localPrefs);
        if (parsed.showYieldTags === undefined) {
          parsed.showYieldTags = true;
        }
        setPreferences(parsed);
      } catch(e) {
        console.error("Local preferences load failed", e);
      }
    }
  }, []);

  const savePreferencesLocally = (newPrefs) => {
    setPreferences(newPrefs);
    localStorage.setItem('anki_video_finder_prefs', JSON.stringify(newPrefs));
    if (worker) {
      worker.postMessage({ type: 'UPDATE_PREFERENCES', payload: newPrefs });
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    localStorage.setItem('anki_gemini_api_key', newKey);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  // Initialize Web Worker securely
  useEffect(() => {
    const blob = new Blob([workerBlobCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const w = new Worker(workerUrl);
    
    w.onmessage = (e) => {
      if (e.data.type === 'LOAD_COMPLETE') {
        if (e.data.count === 0) {
          setCsvStatus('error');
          setErrorMsg('No valid cards found in the provided CSV file.');
        } else {
          setCsvStatus('ready');
          setCardCount(e.data.count);
          setStep1Resources(e.data.step1Resources || []);
          setStep2Resources(e.data.step2Resources || []);
          setErrorMsg('');
          
          const localPrefs = localStorage.getItem('anki_video_finder_prefs');
          let parsedPrefs = {};
          if (localPrefs) {
            try {
              parsedPrefs = JSON.parse(localPrefs);
            } catch (err) {
              console.error(err);
            }
          }

          const dynamicServices = {};
          const allRes = [...(e.data.step1Resources || []), ...(e.data.step2Resources || [])];
          
          const corePriorities = [
            'Boards & Beyond', 'Pathoma', 'Sketchy Micro', 'Sketchy Pharm', 
            'Sketchy Pathology', 'First Aid', 'Costanzo', 'Bootcamp'
          ];

          allRes.forEach(r => {
            if (r === 'Low/High Yield' || r === 'Low/HighYield') return;
            if (parsedPrefs.enabledServices && parsedPrefs.enabledServices[r] !== undefined) {
              dynamicServices[r] = parsedPrefs.enabledServices[r];
            } else {
              dynamicServices[r] = corePriorities.includes(r);
            }
          });
          
          const finalPrefs = {
            examFocus: parsedPrefs.examFocus || 'step1',
            showYieldTags: parsedPrefs.showYieldTags !== undefined ? parsedPrefs.showYieldTags : true,
            enabledServices: dynamicServices
          };

          savePreferencesLocally(finalPrefs);
        }
      } else if (e.data.type === 'SEARCH_COMPLETE') {
        processWorkerResults(e.data.results);
      } else if (e.data.type === 'SEARCH_SYLLABUS_COMPLETE') {
        processWorkerSyllabusResults(e.data.results);
      } else if (e.data.type === 'ERROR') {
        setCsvStatus('error');
        setErrorMsg('Data error: ' + e.data.payload);
      }
    };
    
    setWorker(w);

    setCsvStatus('loading');
    loadFileFromDB()
      .then((cachedData) => {
        if (cachedData) {
          w.postMessage({ type: 'LOAD_CSV', payload: cachedData });
        } else {
          setCsvStatus('idle');
        }
      })
      .catch(() => {
        setCsvStatus('idle');
      });

    return () => {
      w.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, []);

  const fetchRemoteDeck = async () => {
    console.log('fetchRemoteDeck() start');
    const endpoint = DEFAULT_DECK_URL;
    console.log('Fetching remote deck from endpoint:', endpoint);
    setCsvStatus('loading');
    setErrorMsg('');
    try {
      const response = await fetch(endpoint);
      console.log('fetchRemoteDeck() response status:', response.status);
      if (!response.ok) {
        const bodyText = await response.text();
        console.error('fetchRemoteDeck() fetch failed:', response.status, response.statusText, bodyText);
        throw new Error(`HTTP Error: ${response.status}`);
      }
      const text = await response.text();
      console.log('fetchRemoteDeck() response received, bytes:', text.length);
      await saveFileToDB(text);
      console.log('fetchRemoteDeck() saved CSV to IndexedDB');
      if (worker) {
        worker.postMessage({ type: 'LOAD_CSV', payload: text });
      }
      console.log('fetchRemoteDeck() posted LOAD_CSV to worker');
      console.log('fetchRemoteDeck() complete');
    } catch (err) {
      console.error('fetchRemoteDeck() error:', err);
      setCsvStatus('error');
      setErrorMsg('Remote Deck Fetch Failed. Verify connection configuration.');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvStatus('loading');
    setErrorMsg(''); 
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      try {
        await saveFileToDB(text);
      } catch (err) {
        console.error("Failed to save dataset locally:", err);
      }
      worker.postMessage({ type: 'LOAD_CSV', payload: text });
    };
    reader.readAsText(file);
  };

  const handleClearData = async () => {
    try {
      await clearFileFromDB();
    } catch(e) {
      console.error("Failed to flush local storage DB:", e);
    }
    setCsvStatus('idle');
    setCardCount(0);
    setStep1Resources([]);
    setStep2Resources([]);
    setResults([]);
    setSyllabusResults({});
    setSearchStatus('idle');
    setPrompt('');
    setSelectedVideoFilters([]);
    if (worker) {
      worker.postMessage({ type: 'CLEAR_CSV' });
    }
  };

  // --- AUTOMATED API RATE-LIMIT DEBOUNCE PROTECTION ---
  const callGeminiSecureAPI = async (systemInstruction, userPrompt, jsonSchema = null) => {
    if (!apiKey) throw new Error("Missing Gemini API Key. Please add your key in Settings.");
    
    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };
    if (jsonSchema) {
      payload.generationConfig = { responseMimeType: "application/json", responseSchema: jsonSchema };
    }

    const backoffs = [1500, 3000, 6000, 12000];
    for (let attempt = 0; attempt <= 4; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.status === 429) throw new Error("RATE_LIMIT_PAUSE");
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        return jsonSchema ? JSON.parse(output) : output;
      } catch (err) {
        if (err.message === "RATE_LIMIT_PAUSE" && attempt < 4) {
          await new Promise(r => setTimeout(r, backoffs[attempt]));
          continue;
        }
        throw err;
      }
    }
  };

  const handleSearchTrigger = async () => {
    if (!prompt.trim() || csvStatus !== 'ready') return;
    setSearchStatus('extracting');
    setErrorMsg('');
    setResults([]);
    setSyllabusResults({});
    setAiSummary('');
    setSummaryStatus('idle');
    setAiQuiz(null);
    setQuizStatus('idle');
    setCardExplanations({});
    setExtractedConcepts([]);
    setExtractedSyllabus(null);
    setSelectedVideoFilters([]);

    try {
      const isQuotedMode = prompt.trim().startsWith('"') && prompt.trim().endsWith('"');
      const cleanPrompt = isQuotedMode ? prompt.trim().slice(1, -1) : prompt;

      if (isQuotedMode) {
        setSearchMode('syllabus');
        const sys = "Dissect the medical syllabus enclosed in quotes into logical categories. For each category, generate flexible search parameters by grouping ALL related core concepts together in one concept group (they will be OR'd together for comprehensive matching). MANDATORY: only map core diagnostic nouns, diseases, drugs. Exclude formatting verbs. Prioritize breadth of coverage. Return JSON object matches.";
        const schema = {
          type: "OBJECT",
          properties: {
            categories: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  searchQueries: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        description: { type: "STRING" },
                        requiredConcepts: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } }
                      }
                    }
                  }
                }
              }
            }
          }
        };
        const syllabusData = await callGeminiSecureAPI(sys, cleanPrompt, schema);
        if (!syllabusData || !syllabusData.categories || syllabusData.categories.length === 0) {
          throw new Error("Could not parse categories from the quoted syllabus.");
        }
        setExtractedSyllabus(syllabusData);
        setSearchStatus('searching');
        worker.postMessage({ type: 'SEARCH_SYLLABUS', payload: { categories: syllabusData.categories } });
      } else {
        setSearchMode('normal');
        const sys = "Analyze the user's medical query. Break it down into distinct, required independent concepts to build an AND/OR boolean search query. CRITICAL: ONLY include core medical entities (diseases, drugs, anatomy) as required groups. EXCLUDE generic academic terms or verbs. Return a JSON array of arrays of strings.";
        const schema = { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } };
        const conceptGroups = await callGeminiSecureAPI(sys, cleanPrompt, schema);
        if (!conceptGroups || conceptGroups.length === 0) {
          throw new Error("Could not extract meaningful concepts from the prompt.");
        }
        setExtractedConcepts(conceptGroups);
        setSearchStatus('searching');
        worker.postMessage({ type: 'SEARCH', payload: { conceptGroups } });
      }
    } catch (err) {
      setErrorMsg(err.message === "RATE_LIMIT_PAUSE" ? "Google Tier Rate Limit active. Pausing processing queue momentarily..." : "API Error. Validate setup constraints.");
      setSearchStatus('error');
    }
  };

  const generateVideoSummaryData = (flatFormattedCards) => {
    const counts = {};

    flatFormattedCards.forEach(item => {
      Object.entries(item.extractedVideos).forEach(([resourceName, videosList]) => {
        const normalizedName = resourceName === 'B&B' ? 'Boards & Beyond' : 
                               resourceName === 'SketchyMicro' ? 'Sketchy Micro' : 
                               resourceName === 'SketchyPharm' ? 'Sketchy Pharm' : 
                               resourceName === 'SketchyPath' ? 'Sketchy Pathology' : 
                               resourceName;

        // CRITICAL: NEVER render 'Low/High Yield' inside the Video Summary counts
        if (normalizedName === 'Low/High Yield' || normalizedName === 'Low/HighYield') return;

        const isEnabled = (preferences.enabledServices || {})[normalizedName] === true || 
                          (preferences.enabledServices || {})[resourceName] === true;

        if (isEnabled) {
          if (!counts[normalizedName]) {
            counts[normalizedName] = {};
          }
          videosList.forEach(v => {
            counts[normalizedName][v] = (counts[normalizedName][v] || 0) + 1;
          });
        }
      });
    });

    const summary = {};
    Object.entries(counts).forEach(([resourceName, videoMap]) => {
      const sorted = Object.entries(videoMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count); 
        
      // NEW HIGH-YIELD THRESHOLD: Show all >= 4 cards, or fallback to top 3
      const filtered = sorted.filter((item, index) => item.count >= 4 || index < 3);
      summary[resourceName] = filtered;
    });

    return summary;
  };

  const videoSummary = generateVideoSummaryData(results);

  const syllabusVideoSummaries = {};
  if (searchMode === 'syllabus') {
    Object.entries(syllabusResults).forEach(([catName, cards]) => {
      syllabusVideoSummaries[catName] = generateVideoSummaryData(cards);
    });
  }

  const processWorkerResults = (searchResults) => {
    const formattedCards = searchResults.map(item => ({
      ...item.card,
      score: item.score,
      extractedVideos: parseTagsForVideos(item.card.tags, preferences.examFocus)
    }));
    setResults(formattedCards);
    setSearchStatus('complete');
  };

  const processWorkerSyllabusResults = (syllabusResMap) => {
    const formattedSyllabusMap = {};
    const flatResults = []; 

    Object.entries(syllabusResMap).forEach(([category, items]) => {
      formattedSyllabusMap[category] = items.map(item => {
        const formattedCard = {
          ...item.card,
          score: item.score,
          extractedVideos: parseTagsForVideos(item.card.tags, preferences.examFocus)
        };
        flatResults.push(formattedCard);
        return formattedCard;
      });
    });
    setSyllabusResults(formattedSyllabusMap);
    setResults(flatResults); 
    setSearchStatus('complete');
  };

  const parseTagsForVideos = (tagsStr, examFocus = 'step1') => {
    const tags = tagsStr.split(' ');
    const videos = {};
    const baseVideoNames = new Set(); // Track base video names to detect Extra tags

    // Helper function to extract step from first tag part (e.g., "tag:#AK_Step1_v12" -> "step1")
    const extractStepFromTag = (firstPart) => {
      if (!firstPart) return null;
      const lower = firstPart.toLowerCase();
      if (lower.includes('step1')) return 'step1';
      if (lower.includes('step2')) return 'step2';
      return null;
    };

    // Helper function to check if tag matches exam focus
    const tagMatchesExamFocus = (tagStepDesignation, examFocus) => {
      if (!tagStepDesignation) return false;
      if (examFocus === 'step1') return tagStepDesignation === 'step1';
      if (examFocus === 'step2') return tagStepDesignation === 'step2';
      return false;
    };

    // First pass: collect all base video names (without Extra suffix)
    tags.forEach(t => {
      if (!t) return;
      const parts = t.split('::');
      
      // Extract step from the first part (the tag source like "tag:#AK_Step1_v12")
      const tagStep = extractStepFromTag(parts[0]);
      
      // Skip if step doesn't match exam focus
      if (!tagMatchesExamFocus(tagStep, examFocus)) return;
      
      const stepIdx = parts.findIndex(p => p.toLowerCase().includes('step1') || p.toLowerCase().includes('step2'));
      if (stepIdx === -1 || stepIdx + 1 >= parts.length) return;
      
      // Check if last part is "Extra" and extract base name
      const lastPart = parts[parts.length - 1];
      const isExtraTag = lastPart && lastPart.toLowerCase() === 'extra';
      
      if (isExtraTag && parts.length > stepIdx + 2) {
        // This is an Extra tag, construct base name without it
        let basePathParts = parts.slice(stepIdx + 2, -1).map(p => p.replace(/^#/, '').replace(/_/g, ' '));
        basePathParts = basePathParts.filter(p => p && !p.match(/AK Step/i) && !p.match(/AK Other/i));
        const baseVideoName = basePathParts.join(' > ');
        if (baseVideoName) {
          baseVideoNames.add(baseVideoName);
        }
      }
    });

    // Second pass: collect video tags, skipping Extra tags if base exists
    tags.forEach(t => {
      if (!t) return;
      const parts = t.split('::');
      
      // Extract step from the first part (the tag source like "tag:#AK_Step1_v12")
      const tagStep = extractStepFromTag(parts[0]);
      
      // Skip if step doesn't match exam focus
      if (!tagMatchesExamFocus(tagStep, examFocus)) return;
      
      const stepIdx = parts.findIndex(p => p.toLowerCase().includes('step1') || p.toLowerCase().includes('step2'));
      if (stepIdx === -1 || stepIdx + 1 >= parts.length) return;
      
      let resourceRaw = parts[stepIdx + 1].replace(/^#/, '');
      
      if (!resourceRaw || resourceRaw.startsWith('^') || resourceRaw.startsWith('!') || resourceRaw === 'Subjects' || resourceRaw === 'Resources_by_rotation') {
        return;
      }

      // Skip Extra tags if base tag exists
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.toLowerCase() === 'extra') {
        let basePathParts = parts.slice(stepIdx + 2, -1).map(p => p.replace(/^#/, '').replace(/_/g, ' '));
        basePathParts = basePathParts.filter(p => p && !p.match(/AK Step/i) && !p.match(/AK Other/i));
        const baseVideoName = basePathParts.join(' > ');
        if (baseVideoNames.has(baseVideoName)) {
          return; // Skip this Extra tag since base exists
        }
      }

      const resourceMap = {
        'B&B': 'Boards & Beyond',
        'SketchyMicro': 'Sketchy Micro',
        'SketchyPharm': 'Sketchy Pharm',
        'SketchyPath': 'Sketchy Pathology',
        'SketchyAnatomy': 'Sketchy Anatomy',
        'SketchyBiochem': 'Sketchy Biochem',
        'SketchyBiostats/Epidemiology': 'Sketchy Biostats/Epidemiology',
        'SketchyImmunology': 'Sketchy Immunology',
        'SketchyPhysiology': 'Sketchy Physiology',
        'DirtyMedicine': 'Dirty Medicine',
        'FirstAid': 'First Aid',
        'NinjaNerd': 'Ninja Nerd',
        'DivineIntervention': 'Divine Intervention',
        'SketchyFM': 'Sketchy Family Medicine',
        'SketchyIM': 'Sketchy Internal Medicine',
        'SketchyNeurology': 'Sketchy Neurology',
        'SketchyOBGYN': 'Sketchy OBGYN',
        'SketchyPeds': 'Sketchy Pediatrics',
        'SketchyPsych': 'Sketchy Psychiatry',
        'SketchySurgery': 'Sketchy Surgery',
        'Low/HighYield': 'Low/High Yield',
        'USMLERx': 'USMLE Rx',
        'OME': 'OnlineMedEd',
        'OME_banner': 'OnlineMedEd Banner',
        'Resources_by_rotation': 'Resources by Rotation'
      };

      const cleanResourceName = resourceMap[resourceRaw] || resourceRaw;

      let videoPathParts = parts.slice(stepIdx + 2).map(p => p.replace(/^#/, '').replace(/_/g, ' '));
      videoPathParts = videoPathParts.filter(p => p && !p.match(/AK Step/i) && !p.match(/AK Other/i) && p.toLowerCase() !== 'extra');
      
      const cleanVideoName = videoPathParts.join(' > ');
      if (cleanVideoName) {
        if (!videos[cleanResourceName]) {
          videos[cleanResourceName] = [];
        }
        if (!videos[cleanResourceName].includes(cleanVideoName)) {
          videos[cleanResourceName].push(cleanVideoName);
        }
      }
    });
    return videos;
  };

  const formatCardText = (text) => {
    if (!text) return { __html: '' }; 
    let clean = text.replace(/<[^>]+>/g, ' '); 
    const formatted = clean.replace(/{{c\d+::(.*?)(::.*?)?}}/g, (match, p1) => {
      return `<span class="inline-block px-1.5 py-0.5 mx-0.5 bg-indigo-100 text-indigo-800 font-bold border-b-2 border-indigo-500 rounded">${p1}</span>`;
    });
    return { __html: formatted };
  };

  const handleGenerateSummary = async () => {
    if (results.length === 0) return;
    setSummaryStatus('loading');
    try {
      const cardsText = results.slice(0, 30).map(r => r.text).join('\n---\n');
      const sys = "You are an expert medical tutor. Summarize the key medical concepts from these flashcards into a highly condensed, bulleted high-yield study guide. Group by category (e.g., Pathophysiology, Presentation, Treatment). Use markdown formatting (bolding key terms). Do not hallucinate outside info.";
      const text = await callGeminiSecureAPI(sys, "Flashcards:\n" + cardsText);
      setAiSummary(text);
      setSummaryStatus('complete');
    } catch (e) {
      console.error(e);
      setSummaryStatus('error');
    }
  };

  const handleGenerateQuiz = async () => {
    if (results.length === 0) return;
    setShowQuizModal(true);
    setQuizStatus('loading');
    setQuizAnswers({});
    try {
      const cardsText = results.slice(0, 30).map(r => r.text).join('\n---\n');
      const sys = "Generate exactly 3 challenging multiple-choice clinical vignette questions based ONLY on the provided flashcard concepts. They should test application of the knowledge, not just rote recall.";
      const schema = {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "NUMBER" },
            question: { type: "STRING" },
            options: { type: "ARRAY", items: { type: "STRING" } },
            correctAnswerIndex: { type: "NUMBER" },
            explanation: { type: "STRING" }
          },
          required: ["id", "question", "options", "correctAnswerIndex", "explanation"]
        }
      };
      const quizData = await callGeminiSecureAPI(sys, "Flashcards:\n" + cardsText, schema);
      setAiQuiz(quizData);
      setQuizStatus('complete');
    } catch (e) {
      console.error(e);
      setQuizStatus('error');
    }
  };

  const handleExplainCard = async (index, cardText) => {
    setCardExplanations(prev => ({ ...prev, [index]: { status: 'loading', text: '' } }));
    try {
      const sys = "You are a helpful medical tutor. Explain the underlying physiology or rationale behind this specific flashcard simply but accurately for a medical student. Keep it to 2-3 concise sentences.";
      const text = await callGeminiSecureAPI(sys, "Flashcard:\n" + cardText);
      setCardExplanations(prev => ({ ...prev, [index]: { status: 'complete', text } }));
    } catch (e) {
      console.error(e);
      setCardExplanations(prev => ({ ...prev, [index]: { status: 'error', text: 'Failed to generate explanation.' } }));
    }
  };

  const handleToggleVideoFilter = (videoName) => {
    setSelectedVideoFilters(prev => 
      prev.includes(videoName) ? prev.filter(f => f !== videoName) : [...prev, videoName]
    );
  };

  const clearAllFilters = () => setSelectedVideoFilters([]);

  const renderCardItem = (item, index) => (
    <div key={index} className="p-5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
      <div 
        className="text-slate-800 font-medium mb-3 leading-relaxed"
        dangerouslySetInnerHTML={formatCardText(item.text)} 
      />
      
      <div className="flex flex-wrap gap-2 mt-2">
        {Object.keys(item.extractedVideos).map(category => {
          const vids = item.extractedVideos[category];
          const normalizedCategory = category === 'B&B' ? 'Boards & Beyond' : 
                                     category === 'SketchyMicro' ? 'Sketchy Micro' : 
                                     category === 'SketchyPharm' ? 'Sketchy Pharm' : 
                                     category === 'SketchyPath' ? 'Sketchy Pathology' : 
                                     category;

          const isEnabled = (preferences.enabledServices || {})[normalizedCategory] === true || 
                            (preferences.enabledServices || {})[category] === true;

          // SPECIAL YIELD BADGE TOGGLE (Default to true if not explicitly disabled in settings)
          if (normalizedCategory === 'Low/High Yield' || normalizedCategory === 'Low/HighYield') {
            if (preferences.showYieldTags !== false) {
              return vids.map((vid, i) => (
                <span key={`${category}-${i}`} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 animate-fade-in shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{vid}</span>
                </span>
              ));
            }
            return null;
          }

          // STRICT FILTER HIDE (If resource is unchecked in settings, completely hide it)
          if (!vids || vids.length === 0 || !isEnabled) return null;

          return vids.map((vid, i) => (
            <span key={`${category}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 animate-fade-in">
              <Video className="w-3 h-3 text-slate-400" />
              <span className="font-semibold text-slate-900 ml-1">{normalizedCategory}:</span> {vid}
            </span>
          ));
        })}
        
        <button
          onClick={() => handleExplainCard(index, item.text)}
          disabled={cardExplanations[index]?.status === 'loading'}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors ml-auto"
        >
          {cardExplanations[index]?.status === 'loading' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <MessageSquare className="w-3 h-3" />
          )}
          ✨ Explain this
        </button>
      </div>
      
      {cardExplanations[index] && cardExplanations[index].status === 'complete' && (
        <div className="mt-4 p-4 bg-violet-50 rounded-lg border border-violet-100 text-sm text-slate-700 animate-slide-down">
          <div className="font-bold text-violet-900 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4" /> AI Explanation
          </div>
          {cardExplanations[index].text}
        </div>
      )}
    </div>
  );

  const getActiveSettingResources = () => {
    let list = [];
    if (preferences.examFocus === 'step1') list = step1Resources;
    else if (preferences.examFocus === 'step2') list = step2Resources;
    else list = Array.from(new Set([...step1Resources, ...step2Resources]));
    
    // Completely filter out Yield tags from scrolled settings so they never pollute dynamic counts
    return list.filter(r => r !== 'Low/High Yield' && r !== 'Low/HighYield').sort();
  };

  const setAllResourcesSelected = (status) => {
    const updated = { ...preferences.enabledServices };
    getActiveSettingResources().forEach(r => {
      updated[r] = status;
    });
    savePreferencesLocally({ ...preferences, enabledServices: updated });
  };

  // MULTI-SELECT ARRAY DISPATCH INTERSECTION MATCHER
  const getFilteredResults = (targetCardsList) => {
    if (selectedVideoFilters.length === 0) return targetCardsList;
    return targetCardsList.filter(item => {
      const cardFlattenedTagsList = Object.values(item.extractedVideos).flat();
      return selectedVideoFilters.some(activeFilter => cardFlattenedTagsList.includes(activeFilter));
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative pb-10">
      
      {saveToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white py-3 px-5 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2 animate-bounce">
          <span className="text-sm font-semibold">Settings Saved Locally!</span>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Layers className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              Anki Video Finder
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg border border-slate-200 font-medium text-sm transition-all shadow-sm"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              Settings
            </button>

            <div className="flex items-center text-sm font-medium">
              {csvStatus === 'ready' && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle className="w-4 h-4" /> {cardCount.toLocaleString()} Cards
                  </span>
                </div>
              )}
              {csvStatus === 'loading' && (
                <span className="text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200 flex items-center gap-1.5 shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Synchronizing dataset...
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {!apiKey && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-2">
              <div className="flex items-center gap-3">
                <Key className="w-8 h-8 text-amber-500 shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-900 text-sm">Gemini API Key Required</h4>
                  <p className="text-xs text-amber-700">AI features (syllabus parsing, summaries, pre-test quizzes) require an API key to run.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowKeyGuide(!showKeyGuide)}
                  className="text-xs font-semibold bg-white text-amber-800 border border-amber-300 px-3 py-2 rounded-lg hover:bg-amber-100/50 transition-colors flex items-center gap-1"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  {showKeyGuide ? "Hide Tutorial" : "How to Get Key?"}
                </button>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg shadow-sm transition-colors"
                >
                  Add Key in Settings
                </button>
              </div>
            </div>

            {showKeyGuide && (
              <div className="border-t border-amber-200 p-4 bg-amber-50/50 text-xs text-amber-800 leading-relaxed space-y-2 animate-slide-down">
                <p className="font-bold">Follow these steps to generate a free secure developer API key:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Go to Google's official developer console: <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="underline font-bold hover:text-amber-900">Google AI Studio ↗</a>.</li>
                  <li>Log in with any normal personal Google account.</li>
                  <li>Click the blue button at the top-left labeled <strong>"Get API Key"</strong>.</li>
                  <li>Click <strong>"Create API Key"</strong>, choose a project, and select <strong>"Create API Key in new project"</strong>.</li>
                  <li>Copy the generated key string (which begins with <code>AIzaSy...</code>).</li>
                  <li>Open <strong>Settings</strong> on this webpage, paste it into the field, and close Settings!</li>
                </ol>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sliders className="w-4 h-4" /> Active Configurations
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm border-b pb-2 border-slate-100">
                  <span className="text-slate-500">Exam Scope Focus:</span>
                  <span className="font-bold text-indigo-600 capitalize">
                    {preferences.examFocus === 'both' ? 'Step 1 & 2' : preferences.examFocus}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-b pb-2 border-slate-100">
                  <span className="text-slate-500">Active Resources:</span>
                  <span className="font-bold text-indigo-600">
                    {Object.entries(preferences.enabledServices || {}).filter(([k, v]) => v && getActiveSettingResources().includes(k)).length} Enabled
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Source Type:</span>
                  <span className="font-bold text-indigo-600 truncate max-w-[150px]">
                    {csvStatus === 'ready' ? 'Deck Loaded' : 'No deck loaded'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Search className="w-4 h-4 animate-pulse" /> Find Resources
              </h2>
              <p className="text-sm text-slate-600 mb-3 leading-relaxed">
                Enter normal text (e.g., hyperkalemia ECG) or paste raw syllabus learning objectives in <strong>"quotation marks"</strong> to parse categories automatically.
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g., hyperkalemia and EKG&#10;OR&#10;"Physiology diagram the PTH-calcium axis..."'
                className="w-full h-48 p-3 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none mb-4"
                disabled={csvStatus !== 'ready'}
              />
              
              <button
                onClick={handleSearchTrigger}
                disabled={csvStatus !== 'ready' || !prompt.trim() || searchStatus === 'extracting' || searchStatus === 'searching'}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                {searchStatus === 'extracting' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Structuring search terms...</>
                ) : searchStatus === 'searching' ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Scanning dataset...</>
                ) : (
                  <>Start Search Scan</>
                )}
              </button>

              {searchStatus === 'error' && errorMsg && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-2 border border-red-200">
                  <p className="font-medium">{errorMsg}</p>
                </div>
              )}
            </div>

            {/* RESPONSIVE YOUTUBE TUTORIAL PANEL */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-indigo-600" /> App Video Tutorial
              </h2>
              <div className="relative w-full aspect-video rounded-lg overflow-hidden shadow border">
                <iframe 
                  className="absolute inset-0 w-full h-full"
                  src="https://www.youtube.com/embed/nmRW_EvVbL0" 
                  title="Anki Video Finder Tutorial"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  allowFullScreen
                ></iframe>
              </div>
            </div>

          </div>

          <div className="lg:col-span-8 space-y-6">
            
            {searchStatus === 'idle' && results.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500 animate-pulse">
                <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-1">No Search Query Run</h3>
                <p className="text-sm">Connect a remote Anki deck in "Settings" or upload your CSV locally to get started.</p>
              </div>
            )}

            {searchStatus === 'complete' && results.length > 0 && (
              <>
                {searchMode === 'normal' && extractedConcepts.length > 0 && (
                  <InfoBlock title="AI Search Logic (Strict Intersection):" icon={Sparkles} isOpen={isSyllabusLogicExpanded} setIsOpen={setIsSyllabusLogicExpanded}>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {extractedConcepts.map((group, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {idx > 0 && <span className="text-xs font-bold text-blue-400 uppercase">AND</span>}
                          <span className="bg-white px-2.5 py-1 rounded shadow-sm border border-blue-200 text-xs font-medium text-slate-700">
                            {group.join(' OR ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </InfoBlock>
                )}

                {searchMode === 'syllabus' && extractedSyllabus && (
                  <InfoBlock title="AI Syllabus Parsing Logic:" icon={Sparkles} isOpen={isSyllabusLogicExpanded} setIsOpen={setIsSyllabusLogicExpanded}>
                    <div className="space-y-3 pt-1">
                      {extractedSyllabus.categories.map((cat, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                          <h4 className="font-bold text-blue-800 text-sm mb-2 uppercase tracking-wide">{cat.name}</h4>
                          <ul className="space-y-2">
                            {cat.searchQueries.map((q, qIdx) => (
                              <li key={qIdx} className="text-xs border-l-2 border-blue-200 pl-2 ml-1">
                                <span className="font-medium text-slate-700 block mb-1">{q.description}</span>
                                <div className="flex flex-wrap gap-1">
                                  {q.requiredConcepts.map((group, gIdx) => (
                                    <span key={gIdx} className="flex items-center gap-1">
                                      {gIdx > 0 && <span className="text-blue-400 font-bold text-[10px]">AND</span>}
                                      <span className="bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100 text-slate-600">
                                        {group.join(' | ')}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </InfoBlock>
                )}

                <SectionCard
                  title="Recommended Videos"
                  icon={PlayCircle}
                  theme="indigo"
                  headerRight={
                    <div className="flex items-center gap-2">
                      {selectedVideoFilters.length > 0 && (
                        <button 
                          onClick={clearAllFilters}
                          className="text-xs flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-semibold px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
                        >
                          <Filter className="w-3 h-3" /> Clear ({selectedVideoFilters.length}) Filters
                        </button>
                      )}
                      <button 
                        onClick={handleGenerateSummary}
                        disabled={summaryStatus === 'loading'}
                        className="text-xs sm:text-sm font-semibold bg-white text-indigo-700 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        {summaryStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        ✨ AI Summary
                      </button>
                      <button 
                        onClick={handleGenerateQuiz}
                        className="text-xs sm:text-sm font-semibold bg-indigo-600 text-white border border-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <BrainCircuit className="w-4 h-4" />
                        ✨ Pre-test Quiz
                      </button>
                    </div>
                  }
                >
                  {summaryStatus !== 'idle' && (
                    <div className="bg-violet-50/50 border-b border-violet-100 p-5">
                      <h3 className="text-sm font-bold text-violet-900 flex items-center gap-2 mb-3">
                        ✨ High-Yield AI Concept Summary
                      </h3>
                      {summaryStatus === 'loading' ? (
                        <div className="flex items-center gap-2 text-sm text-violet-600">
                          <Loader2 className="w-4 h-4 animate-spin" /> Synthesizing guide...
                        </div>
                      ) : (
                        <div 
                          className="prose prose-sm prose-violet max-w-none text-slate-700 prose-p:leading-relaxed prose-li:my-0.5"
                          dangerouslySetInnerHTML={{ __html: aiSummary.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>').replace(/- /g, '• ') }}
                        />
                      )}
                    </div>
                  )}
                  
                  {searchMode === 'normal' ? (
                    <CollapsibleSection 
                      summaryData={videoSummary} 
                      preferences={preferences}
                      selectedVideoFilters={selectedVideoFilters}
                      handleToggleVideoFilter={handleToggleVideoFilter}
                    />
                  ) : (
                    <div className="divide-y divide-slate-100 animate-fade-in">
                      <CollapsibleSection 
                        summaryData={videoSummary} 
                        title="Aggregate (All Categories)" 
                        preferences={preferences}
                        selectedVideoFilters={selectedVideoFilters}
                        handleToggleVideoFilter={handleToggleVideoFilter}
                      />
                      {Object.entries(syllabusVideoSummaries).map(([catName, catSummary]) => (
                        <CollapsibleSection 
                          key={catName}
                          summaryData={catSummary} 
                          title={catName} 
                          preferences={preferences}
                          selectedVideoFilters={selectedVideoFilters}
                          handleToggleVideoFilter={handleToggleVideoFilter}
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Normal Mode List */}
                {searchMode === 'normal' && (() => {
                  const filteredList = getFilteredResults(results);
                  return (
                    <SectionCard
                      title="Associated Flashcards"
                      icon={BookOpen}
                      theme="slate"
                      badgeText={`${filteredList.length} results`}
                    >
                      <div className="divide-y divide-slate-100 max-h-[800px] overflow-y-auto">
                        {filteredList.map((item, idx) => renderCardItem(item, `norm-${idx}`))}
                      </div>
                    </SectionCard>
                  );
                })()}

                {/* Syllabus Mode List */}
                {searchMode === 'syllabus' && (
                  <div>
                    {Object.entries(syllabusResults).map(([categoryName, items]) => {
                      const filteredItems = getFilteredResults(items);
                      if (filteredItems.length === 0) return null; 
                      
                      return (
                        <SectionCard
                          key={categoryName}
                          title={categoryName}
                          icon={AlignLeft}
                          theme="slate"
                          badgeText={`${filteredItems.length} results`}
                        >
                          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                            {filteredItems.map((item, idx) => renderCardItem(item, `syl-${categoryName}-${idx}`))}
                          </div>
                        </SectionCard>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Configuration Settings Panel Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-end animate-fade-in">
          <div className="bg-white w-full max-w-lg h-full p-6 flex flex-col justify-between shadow-2xl relative overflow-y-auto">
            <div className="flex-1">
              <div className="flex items-center justify-between border-b pb-4 border-slate-200 mb-6">
                <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-indigo-600 animate-spin" /> Configurations Settings
                </h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                
                {/* Secure API Key input */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-indigo-500" /> Gemini API Developer Key
                  </label>
                  <input 
                    type="password"
                    placeholder="Paste AI API key here..."
                    value={apiKey}
                    onChange={(e) => handleSaveApiKey(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-slate-700 font-mono shadow-inner"
                  />
                  <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg mt-2 text-[11px] text-slate-500 leading-relaxed">
                    <span className="font-bold block text-slate-700 mb-1">🔑 Quick Setup Guide:</span>
                    <ol className="list-decimal pl-3 space-y-0.5">
                      <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="underline font-semibold text-indigo-600 hover:text-indigo-800">Google AI Studio ↗</a>.</li>
                      <li>Click blue button <strong>"Get API Key"</strong>.</li>
                      <li>Select <strong>"Create API Key in new project"</strong> and paste the key here!</li>
                    </ol>
                  </div>
                </div>

                {/* Exam relevance toggle */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Exam Scope Focus
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['step1', 'step2', 'both'].map((type) => (
                      <button
                        key={type}
                        onClick={() => savePreferencesLocally({ ...preferences, examFocus: type })}
                        className={`py-2 px-3 rounded-lg border text-sm font-semibold capitalize transition-all ${
                          preferences.examFocus === type 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {type === 'both' ? 'Both' : type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dedicated Low/High Yield display toggle */}
                <div className="border-t pt-4 border-slate-100">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Card Yield Display
                  </label>
                  <button
                    onClick={() => savePreferencesLocally({ 
                      ...preferences, 
                      showYieldTags: preferences.showYieldTags === false ? true : false 
                    })}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border text-sm font-medium transition-all ${
                      preferences.showYieldTags !== false 
                        ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className={`w-4 h-4 ${preferences.showYieldTags !== false ? 'text-amber-500' : 'text-slate-400'}`} />
                      Show High/Low Yield Badges on Flashcards
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                      preferences.showYieldTags !== false ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {preferences.showYieldTags !== false ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </button>
                </div>

                {/* Filter dynamically scanned services */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Filter Scanned Resources ({getActiveSettingResources().length} scanned)
                    </label>
                    
                    {/* BATCH SELECTOR TOGGLES */}
                    {getActiveSettingResources().length > 0 && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setAllResourcesSelected(true)}
                          className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-all"
                        >
                          Check All
                        </button>
                        <button
                          onClick={() => setAllResourcesSelected(false)}
                          className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-all"
                        >
                          Uncheck All
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {getActiveSettingResources().length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-50 text-xs text-slate-400 italic text-center border border-dashed">
                      Upload your Anki CSV database first to dynamically populate and filter tag resources.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 border border-slate-100 rounded-lg p-2 bg-slate-50/50 shadow-inner">
                      {getActiveSettingResources().map((service) => (
                        <label 
                          key={service}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-100 cursor-pointer transition-colors text-xs font-medium text-slate-700"
                        >
                          <input 
                            type="checkbox"
                            checked={(preferences.enabledServices || {})[service] === true}
                            onChange={() => {
                              const updatedServices = { 
                                ...preferences.enabledServices, 
                                [service]: (preferences.enabledServices || {})[service] === true ? false : true
                              };
                              savePreferencesLocally({ ...preferences, enabledServices: updatedServices });
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          <span>{service}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Remote Deck Sync Button (URL Hidden) */}
                <div className="border-t pt-4 border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Database Sync
                    </label>
                    <span className="text-[10px] text-slate-400 font-normal">Remote connection</span>
                  </div>
                  <button
                    onClick={() => {
                      console.log('Sync Deck button clicked');
                      setShowSettings(false); // Close modal to show the loading state
                      fetchRemoteDeck();
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Sync Remote Deck
                  </button>
                </div>

                {/* Fallback Local CSV Upload */}
                <div className="border-t pt-5 border-slate-100">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Fallback Local File Upload
                  </label>
                  <div className="relative border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="file" 
                      accept=".csv,.txt"
                      ref={fileInputRef}
                      onChange={(e) => {
                        handleFileUpload(e);
                        setShowSettings(false);
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700 block">Select CSV / TSV File</span>
                  </div>
                  <button 
                    onClick={handleClearData}
                    className="mt-3 w-full border border-red-200 hover:bg-red-50 text-red-600 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Reset Local Cache Database
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 border-slate-200 flex items-center justify-between text-xs text-slate-400 font-medium shrink-0 mt-4">
              <span>Standard Offline Mode Active</span>
              <span>Data stored locally</span>
            </div>
          </div>
        </div>
      )}

      {/* AI Quiz Modal */}
      {showQuizModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-indigo-50">
              <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-indigo-600" /> AI Mini-Quiz
              </h2>
              <button 
                onClick={() => setShowQuizModal(false)}
                className="text-slate-500 hover:text-slate-700 p-1 rounded-md hover:bg-indigo-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
              {quizStatus === 'loading' && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                  <p>Generating a custom quiz based on your cards...</p>
                </div>
              )}

              {quizStatus === 'complete' && aiQuiz && (
                <div className="space-y-8">
                  {aiQuiz.map((q, qIndex) => (
                    <div key={q.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-4 flex gap-3">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-sm shrink-0 h-fit">Q{qIndex + 1}</span>
                        {q.question}
                      </h3>
                      <div className="space-y-2">
                        {q.options.map((opt, optIndex) => {
                          const isSelected = quizAnswers[qIndex] !== undefined;
                          const isUserAnswer = quizAnswers[qIndex] === optIndex;
                          const isCorrect = q.correctAnswerIndex === optIndex;
                          
                          let btnStyle = "border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-slate-700";
                          if (isSelected) {
                            if (isCorrect) btnStyle = "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium";
                            else if (isUserAnswer) btnStyle = "border-red-400 bg-red-50 text-red-800 line-through opacity-70";
                            else btnStyle = "border-slate-200 opacity-50";
                          }

                          return (
                            <button
                              key={optIndex}
                              disabled={isSelected}
                              onClick={() => setQuizAnswers(prev => ({ ...prev, [qIndex]: optIndex }))}
                              className={`w-full text-left p-3 rounded-lg border transition-all ${btnStyle}`}
                            >
                              {['A', 'B', 'C', 'D'][optIndex]}. {opt}
                            </button>
                          );
                        })}
                      </div>
                      
                      {quizAnswers[qIndex] !== undefined && (
                        <div className="mt-4 p-4 bg-indigo-50 rounded-lg text-sm text-indigo-900 border border-indigo-100 flex items-start gap-3">
                          <div>
                            <span className="font-bold block mb-1">Explanation:</span>
                            {q.explanation}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// --- OUTSIDE COMPONENTS ---
const CollapsibleCategory = ({ category, vids, selectedVideoFilters, handleToggleVideoFilter }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  return (
    <div className="space-y-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1 hover:text-indigo-600 transition-colors focus:outline-none"
      >
        <span>{category}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      
      {isOpen && (
        <ul className="space-y-1 mt-2">
          {vids.map((vidObj, idx) => {
            const isCurrentlyFiltered = selectedVideoFilters.includes(vidObj.name);
            return (
              <li 
                key={idx} 
                onClick={() => handleToggleVideoFilter(vidObj.name)}
                className={`text-sm flex items-start justify-between gap-3 py-1.5 px-2 -mx-2 rounded-md cursor-pointer transition-all ${
                  isCurrentlyFiltered 
                    ? 'bg-indigo-600 text-white border border-indigo-700 shadow-sm font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                title="Click to toggle multi-select filter"
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${isCurrentlyFiltered ? 'text-white' : 'text-indigo-400'}`}>•</span> 
                  <span>{vidObj.name}</span>
                </div>
                <span className={`${
                  isCurrentlyFiltered 
                    ? 'bg-indigo-700 text-indigo-100' 
                    : 'bg-indigo-100 text-indigo-700'
                } px-1.5 py-0.5 rounded text-xs font-bold shrink-0 mt-0.5 transition-colors`}>
                  {vidObj.count} card{vidObj.count !== 1 ? 's' : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const CollapsibleSection = ({ summaryData, title, preferences, selectedVideoFilters, handleToggleVideoFilter }) => {
  const [isOpen, setIsOpen] = useState(true);
  
  if (!summaryData) return null;

  const activeSummaryData = Object.fromEntries(
    Object.entries(summaryData).filter(([category, vids]) => 
      vids.length > 0 && (preferences.enabledServices || {})[category] === true
    )
  );
  
  const isEmpty = Object.keys(activeSummaryData).length === 0;
  
  return (
    <div className="p-5 border-t border-slate-100 first:border-t-0">
      {title && (
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between text-sm font-bold text-slate-800 mb-4 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors focus:outline-none"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500" /> {title}
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
      )}
      {(!title || isOpen) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
          {Object.entries(activeSummaryData).map(([category, vids]) => (
            <CollapsibleCategory 
              key={category} 
              category={category} 
              vids={vids} 
              selectedVideoFilters={selectedVideoFilters}
              handleToggleVideoFilter={handleToggleVideoFilter}
            />
          ))}
          
          {isEmpty && (
            <p className="text-sm text-slate-500 italic col-span-full">
              No active videos matched your preferences.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const InfoBlock = ({ title, icon: Icon, isOpen, setIsOpen, children }) => {
  return (
    <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-100 mb-6 overflow-hidden">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-blue-100/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-blue-900 select-none">
          <Icon className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-bold">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-blue-400" /> : <ChevronDown className="w-4 h-4 text-blue-400" />}
      </div>
      {isOpen && (
        <div className="px-4 pb-4 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
};

const SectionCard = ({ title, icon: Icon, badgeText, theme = 'slate', defaultOpen = true, headerRight, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const themes = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-900', icon: 'text-indigo-600', chevron: 'text-indigo-400' },
    slate: { bg: 'bg-slate-50/50', text: 'text-slate-800', icon: 'text-slate-600', chevron: 'text-slate-400' }
  };

  const t = themes[theme] || themes.slate;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`${t.bg} border-b border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors hover:bg-slate-100/50`}
      >
        <div className="flex items-center gap-2 select-none">
          <Icon className={`w-5 h-5 ${t.icon}`} />
          <h2 className={`text-lg font-bold ${t.text}`}>
            {title} {badgeText && <span className="text-sm font-normal opacity-70 ml-1">({badgeText})</span>}
          </h2>
          {isOpen ? <ChevronUp className={`w-5 h-5 ml-1 ${t.chevron}`} /> : <ChevronDown className={`w-5 h-5 ml-1 ${t.chevron}`} />}
        </div>
        {headerRight && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
      </div>
      {isOpen && <div className="bg-white">{children}</div>}
    </div>
  );
};