import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Search, Video, BookOpen, Layers, 
  CheckCircle, Loader2, FileText, AlertCircle, PlayCircle,
  Sparkles, BrainCircuit, MessageSquare, X, AlignLeft, Trash2,
  ChevronDown, ChevronUp, Settings, Sliders
} from 'lucide-react';

const apiKey = ""; // API key is injected by the environment at runtime

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
  
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState({
    examFocus: 'step1', 
    enabledServices: {
      'Boards & Beyond': true,
      'Pathoma': true,
      'Sketchy Micro': true,
      'Sketchy Pharm': true
    },
    remoteDeckUrl: '' 
  });
  const [saveToast, setSaveToast] = useState(false);
  
  const [searchStatus, setSearchStatus] = useState('idle'); 
  const [searchMode, setSearchMode] = useState('normal'); 
  const [results, setResults] = useState([]); 
  const [syllabusResults, setSyllabusResults] = useState({}); 
  const [syllabusVideoSummaries, setSyllabusVideoSummaries] = useState({}); 
  
  const [videoSummary, setVideoSummary] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [extractedConcepts, setExtractedConcepts] = useState([]); 
  const [extractedSyllabus, setExtractedSyllabus] = useState(null); 
  const [selectedVideoFilter, setSelectedVideoFilter] = useState(null); 

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

  // Initialize Web Worker with correct production url paths
  useEffect(() => {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    
    w.onmessage = (e) => {
      if (e.data.type === 'LOAD_COMPLETE') {
        if (e.data.count === 0) {
          setCsvStatus('error');
          setErrorMsg('No valid cards found in the provided CSV file.');
        } else {
          setCsvStatus('ready');
          setCardCount(e.data.count);
          setErrorMsg('');
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

    // Load Cached CSV on Startup
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
    };
  }, []);

  // Sync Remote Deck URL on configuration trigger
  useEffect(() => {
    if (preferences.remoteDeckUrl && csvStatus === 'idle') {
      fetchRemoteDeck(preferences.remoteDeckUrl);
    }
  }, [preferences.remoteDeckUrl]);

  const fetchRemoteDeck = async (url) => {
    if (!url) return;
    setCsvStatus('loading');
    setErrorMsg('');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const text = await response.text();
      await saveFileToDB(text);
      if (worker) {
        worker.postMessage({ type: 'LOAD_CSV', payload: text });
      }
    } catch (err) {
      console.error(err);
      setCsvStatus('error');
      setErrorMsg('Remote Deck Fetch Failed. Verify connection configuration or raw Gist Link.');
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
        const updatedPrefs = { ...preferences, remoteDeckUrl: '' };
        savePreferencesLocally(updatedPrefs);
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
      const updatedPrefs = { ...preferences, remoteDeckUrl: '' };
      savePreferencesLocally(updatedPrefs);
    } catch(e) {
      console.error("Failed to flush local storage DB:", e);
    }
    setCsvStatus('idle');
    setCardCount(0);
    setResults([]);
    setSyllabusResults({});
    setSyllabusVideoSummaries({});
    setVideoSummary(null);
    setSearchStatus('idle');
    setPrompt('');
    setSelectedVideoFilter(null);
    if (worker) {
      worker.postMessage({ type: 'CLEAR_CSV' });
    }
  };

  const callGeminiJSON = async (systemInstruction, userPrompt, schema) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { responseMimeType: "application/json", responseSchema: schema }
    };

    for (let i = 0; i < 6; i++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();
        return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
      } catch (err) {
        if (i === 5) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  const callGeminiText = async (systemInstruction, userPrompt) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    for (let i = 0; i < 6; i++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        if (i === 5) throw err;
        await new Promise(r => setTimeout(r, delays[i]));
      }
    }
  };

  const extractKeywordsFromAI = async (text) => {
    const schema = {
      type: "ARRAY",
      items: { 
        type: "ARRAY",
        items: { type: "STRING" }
      }
    };
    const sys = "Analyze the user's medical query. Break it down into distinct, required independent concepts to build an AND/OR boolean search query. CRITICAL: ONLY include core medical entities (diseases, drugs, anatomy) as required groups. EXCLUDE generic academic terms or verbs (e.g., 'mechanism of action', 'treatment', 'describe', 'pathophysiology', 'causes') because requiring them will filter out valid flashcards. For each core concept, provide an array of synonyms/abbreviations. Example: 'describe the mechanism of action of thiazides in hyperkalemia' -> [['thiazide', 'thiazides', 'hctz'], ['hyperkalemia', 'high k+', 'hyperkalemic']]. Return a JSON array of arrays of strings.";
    return await callGeminiJSON(sys, text, schema);
  };

  const extractSyllabusFromAI = async (text) => {
    const schema = {
      type: "OBJECT",
      properties: {
        categories: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING", description: "Name of category e.g., Physiology, Pathology" },
              searchQueries: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    description: { type: "STRING", description: "Short description of learning objective" },
                    requiredConcepts: {
                      type: "ARRAY",
                      description: "Array of groups. Acts as AND logic between groups. Within group is OR.",
                      items: {
                        type: "ARRAY",
                        items: { type: "STRING" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    const sys = "The user has provided a syllabus or list of objectives enclosed in quotes. Dissect it into logical categories (e.g., Physiology, Pathology, Pharmacology, etc. based on the text headers). For each category, create multiple highly specific boolean search queries to find flashcards covering those objectives. A search query must have a 'description' and a 'requiredConcepts' array (AND logic between groups, OR logic within groups). CRITICAL: 'requiredConcepts' are MANDATORY for a card to match. Therefore, ONLY include core medical entities (specific drugs, diseases, anatomical structures, pathogens) as required groups. DO NOT include generic academic terms (e.g., 'mechanism of action', 'pathophysiology', 'diagnosis', 'treatment', 'evaluate', 'causes') as their own concept groups, because flashcards rarely contain these exact structural words. Keep synonym strings short and accurate.";
    return await callGeminiJSON(sys, text, schema);
  };

  const handleSearch = async () => {
    if (!prompt.trim() || csvStatus !== 'ready') return;
    
    setSearchStatus('extracting');
    setErrorMsg('');
    setResults([]);
    setSyllabusResults({});
    setSyllabusVideoSummaries({});
    setVideoSummary(null);
    setAiSummary('');
    setSummaryStatus('idle');
    setAiQuiz(null);
    setQuizStatus('idle');
    setCardExplanations({});
    setExtractedConcepts([]);
    setExtractedSyllabus(null);
    setSelectedVideoFilter(null);

    try {
      const isQuotedMode = prompt.trim().startsWith('"') && prompt.trim().endsWith('"');
      const cleanPrompt = isQuotedMode ? prompt.trim().slice(1, -1) : prompt;

      if (isQuotedMode) {
        setSearchMode('syllabus');
        const syllabusData = await extractSyllabusFromAI(cleanPrompt);
        
        if (!syllabusData || !syllabusData.categories || syllabusData.categories.length === 0) {
          throw new Error("Could not parse categories from the quoted syllabus.");
        }
        
        setExtractedSyllabus(syllabusData);
        setSearchStatus('searching');
        worker.postMessage({ type: 'SEARCH_SYLLABUS', payload: { categories: syllabusData.categories } });
      } else {
        setSearchMode('normal');
        const conceptGroups = await extractKeywordsFromAI(cleanPrompt);
        
        if (!conceptGroups || conceptGroups.length === 0) {
          throw new Error("Could not extract meaningful concepts from the prompt.");
        }

        setExtractedConcepts(conceptGroups);
        setSearchStatus('searching');
        worker.postMessage({ type: 'SEARCH', payload: { conceptGroups } });
      }
      
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during search.');
      setSearchStatus('error');
    }
  };

  const generateVideoSummaryData = (flatFormattedCards) => {
    const counts = {
      'Boards & Beyond': {},
      'Pathoma': {},
      'Sketchy Micro': {},
      'Sketchy Pharm': {}
    };

    flatFormattedCards.forEach(item => {
      if (preferences.enabledServices['Boards & Beyond']) {
        item.extractedVideos['B&B'].forEach(v => {
          counts['Boards & Beyond'][v] = (counts['Boards & Beyond'][v] || 0) + 1;
        });
      }
      if (preferences.enabledServices['Pathoma']) {
        item.extractedVideos['Pathoma'].forEach(v => {
          counts['Pathoma'][v] = (counts['Pathoma'][v] || 0) + 1;
        });
      }
      if (preferences.enabledServices['Sketchy Micro']) {
        item.extractedVideos['Sketchy Micro'].forEach(v => {
          counts['Sketchy Micro'][v] = (counts['Sketchy Micro'][v] || 0) + 1;
        });
      }
      if (preferences.enabledServices['Sketchy Pharm']) {
        item.extractedVideos['Sketchy Pharm'].forEach(v => {
          counts['Sketchy Pharm'][v] = (counts['Sketchy Pharm'][v] || 0) + 1;
        });
      }
    });

    const sortCounts = (obj) => {
      const sorted = Object.entries(obj)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count); 
        
      const filtered = sorted.filter(item => item.count >= 5);
      
      if (filtered.length < 3) {
        return sorted.slice(0, 3);
      }
      
      return filtered;
    };

    return {
      'Boards & Beyond': sortCounts(counts['Boards & Beyond']),
      'Pathoma': sortCounts(counts['Pathoma']),
      'Sketchy Micro': sortCounts(counts['Sketchy Micro']),
      'Sketchy Pharm': sortCounts(counts['Sketchy Pharm'])
    };
  };

  const processWorkerResults = (searchResults) => {
    const formattedCards = searchResults.map(item => ({
      ...item.card,
      score: item.score,
      extractedVideos: parseTagsForVideos(item.card.tags)
    }));

    setVideoSummary(generateVideoSummaryData(formattedCards));
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
          extractedVideos: parseTagsForVideos(item.card.tags)
        };
        flatResults.push(formattedCard);
        return formattedCard;
      });
    });

    setVideoSummary(generateVideoSummaryData(flatResults));
    
    const categorySummaries = {};
    Object.entries(formattedSyllabusMap).forEach(([catName, cards]) => {
      categorySummaries[catName] = generateVideoSummaryData(cards);
    });
    setSyllabusVideoSummaries(categorySummaries);

    setSyllabusResults(formattedSyllabusMap);
    setResults(flatResults); 
    setSearchStatus('complete');
  };

  const parseTagsForVideos = (tagsStr) => {
    const tags = tagsStr.split(' ');
    const videos = { 'B&B': [], 'Pathoma': [], 'Sketchy Micro': [], 'Sketchy Pharm': [] };

    tags.forEach(t => {
      if (!t) return;
      const tLower = t.toLowerCase();
      
      if (tLower.includes('step2')) return;
      
      let category = null;

      if (tLower.includes('b&b')) category = 'B&B';
      else if (tLower.includes('pathoma')) category = 'Pathoma';
      else if (tLower.includes('sketchy') && tLower.includes('micro')) category = 'Sketchy Micro';
      else if (tLower.includes('sketchy') && tLower.includes('pharm')) category = 'Sketchy Pharm';

      if (category) {
        let parts = t.split('::').map(p => p.replace(/^#/, '').replace(/_/g, ' '));
        parts = parts.filter(p => 
          !p.match(/AK Step/i) && !p.match(/AK Other/i) && 
          !p.match(/^B&B$/i) && !p.match(/^Pathoma$/i) && 
          !p.match(/^Sketchy.*$/i) && !p.match(/^Subjects$/i)
        );
        const cleanName = parts.join(' > ');
        if (cleanName && !videos[category].includes(cleanName)) {
          videos[category].push(cleanName);
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
      const text = await callGeminiText(sys, "Flashcards:\n" + cardsText);
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
      const quizData = await callGeminiJSON(sys, "Flashcards:\n" + cardsText, schema);
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
      const text = await callGeminiText(sys, "Flashcard:\n" + cardText);
      setCardExplanations(prev => ({ ...prev, [index]: { status: 'complete', text } }));
    } catch (e) {
      console.error(e);
      setCardExplanations(prev => ({ ...prev, [index]: { status: 'error', text: 'Failed to generate explanation.' } }));
    }
  };

  const renderCardItem = (item, index) => (
    <div key={index} className="p-5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
      <div 
        className="text-slate-800 font-medium mb-3 leading-relaxed"
        dangerouslySetInnerHTML={formatCardText(item.text)} 
      />
      
      <div className="flex flex-wrap gap-2 mt-2">
        {['B&B', 'Pathoma', 'Sketchy Micro', 'Sketchy Pharm'].map(category => {
          const vids = item.extractedVideos[category];
          if (!vids || vids.length === 0) return null;
          return vids.map((vid, i) => (
            <span key={`${category}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
              <Video className="w-3 h-3 text-slate-400" />
              <span className="font-semibold text-slate-900 ml-1">{category}:</span> {vid}
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
        <div className="mt-4 p-4 bg-violet-50 rounded-lg border border-violet-100 text-sm text-slate-700">
          <div className="font-bold text-violet-900 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-4 h-4" /> AI Explanation
          </div>
          {cardExplanations[index].text}
        </div>
      )}
    </div>
  );

  const CollapsibleCategory = ({ category, vids, selectedVideoFilter, setSelectedVideoFilter }) => {
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
            {vids.map((vidObj, idx) => (
              <li 
                key={idx} 
                onClick={() => setSelectedVideoFilter(selectedVideoFilter === vidObj.name ? null : vidObj.name)}
                className={`text-sm flex items-start justify-between gap-3 py-1.5 px-2 -mx-2 rounded-md cursor-pointer transition-all ${
                  selectedVideoFilter === vidObj.name 
                    ? 'bg-indigo-100 text-indigo-900 border border-indigo-200 shadow-sm font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
                title="Click to filter flashcards by this video"
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 ${selectedVideoFilter === vidObj.name ? 'text-indigo-600' : 'text-indigo-400'}`}>•</span> 
                  <span>{vidObj.name}</span>
                </div>
                <span className={`${
                  selectedVideoFilter === vidObj.name 
                    ? 'bg-indigo-200 text-indigo-800' 
                    : 'bg-indigo-100 text-indigo-700'
                } px-1.5 py-0.5 rounded text-xs font-bold shrink-0 mt-0.5 transition-colors`}>
                  {vidObj.count} card{vidObj.count !== 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const CollapsibleSection = ({ summaryData, title, selectedVideoFilter, setSelectedVideoFilter }) => {
    const [isOpen, setIsOpen] = useState(true);
    
    if (!summaryData) return null;
    const isEmpty = Object.values(summaryData).every(v => v.length === 0);
    
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(summaryData).map(([category, vids]) => {
              if (vids.length === 0) return null;
              return (
                <CollapsibleCategory 
                  key={category} 
                  category={category} 
                  vids={vids} 
                  selectedVideoFilter={selectedVideoFilter} 
                  setSelectedVideoFilter={setSelectedVideoFilter} 
                />
              );
            })}
            
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

  const InfoBlock = ({ title, icon: Icon, defaultOpen = true, children }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
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
          <div className="px-4 pb-4">
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
        {isOpen && (
           <div className="bg-white">
              {children}
           </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative pb-10">
      
      {/* Cloud/Local Sync Notification Toast */}
      {saveToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white py-3 px-5 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2 animate-bounce">
          <span className="text-sm font-semibold">Preferences Updated Locally!</span>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
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
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg border border-slate-200 font-medium text-sm transition-all"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              Settings
            </button>

            <div className="flex items-center text-sm font-medium">
              {csvStatus === 'ready' && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle className="w-4 h-4" /> {cardCount.toLocaleString()} Cards loaded
                  </span>
                </div>
              )}
              {csvStatus === 'loading' && (
                <span className="text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200 flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" /> Fetching database...
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Controls Column */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Active Configurations Info */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                Active Filters
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm border-b pb-2 border-slate-100">
                  <span className="text-slate-500">Exam Scope:</span>
                  <span className="font-bold text-indigo-600 capitalize">
                    {preferences.examFocus === 'both' ? 'Step 1 & 2' : preferences.examFocus}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-b pb-2 border-slate-100">
                  <span className="text-slate-500">Video Services:</span>
                  <span className="font-bold text-indigo-600">
                    {Object.entries(preferences.enabledServices).filter(([_, v]) => v).length} Enabled
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Source Type:</span>
                  <span className="font-bold text-indigo-600 truncate max-w-[150px]">
                    {preferences.remoteDeckUrl ? 'Cloud (GitHub)' : 'Local cache'}
                  </span>
                </div>
              </div>
            </div>

            {/* Resource Search Panel */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                Find Resources
              </h2>
              <p className="text-sm text-slate-600 mb-3">
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
                onClick={handleSearch}
                disabled={csvStatus !== 'ready' || !prompt.trim() || searchStatus === 'extracting' || searchStatus === 'searching'}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
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
                  <p>{errorMsg}</p>
                </div>
              )}
            </div>
          </div>

          {/* Display Content Column */}
          <div className="lg:col-span-8 space-y-6">
            
            {searchStatus === 'idle' && results.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
                <h3 className="text-lg font-medium text-slate-900 mb-1">No Search Query Run</h3>
                <p className="text-sm">Connect a remote AnKing deck in "Settings" or upload your CSV locally to get started.</p>
              </div>
            )}

            {searchStatus === 'complete' && results.length > 0 && (
              <>
                {/* AI Concept Interpretation UI - Normal Mode */}
                {searchMode === 'normal' && extractedConcepts.length > 0 && (
                  <InfoBlock title="AI Search Logic (Strict Intersection):" icon={Sparkles}>
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

                {/* AI Concept Interpretation UI - Syllabus Mode */}
                {searchMode === 'syllabus' && extractedSyllabus && (
                  <InfoBlock title="AI Syllabus Parsing Logic:" icon={Sparkles}>
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

                {/* Master Video Summary List */}
                <SectionCard
                  title="Recommended Videos"
                  icon={PlayCircle}
                  theme="indigo"
                  headerRight={
                    <>
                      <button 
                        onClick={handleGenerateSummary}
                        disabled={summaryStatus === 'loading'}
                        className="text-xs sm:text-sm font-medium bg-white text-indigo-700 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        {summaryStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        ✨ AI Summary
                      </button>
                      <button 
                        onClick={handleGenerateQuiz}
                        className="text-xs sm:text-sm font-medium bg-indigo-600 text-white border border-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <BrainCircuit className="w-4 h-4" />
                        ✨ Pre-test Quiz
                      </button>
                    </>
                  }
                >
                  {/* AI Summary Section */}
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
                      selectedVideoFilter={selectedVideoFilter} 
                      setSelectedVideoFilter={setSelectedVideoFilter} 
                    />
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <CollapsibleSection 
                        summaryData={videoSummary} 
                        title="Aggregate (All Categories)" 
                        selectedVideoFilter={selectedVideoFilter} 
                        setSelectedVideoFilter={setSelectedVideoFilter} 
                      />
                      {Object.entries(syllabusVideoSummaries).map(([catName, catSummary]) => (
                        <CollapsibleSection 
                          key={catName}
                          summaryData={catSummary} 
                          title={catName} 
                          selectedVideoFilter={selectedVideoFilter} 
                          setSelectedVideoFilter={setSelectedVideoFilter} 
                        />
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Normal Mode List */}
                {searchMode === 'normal' && (() => {
                  const displayedResults = selectedVideoFilter 
                    ? results.filter(item => Object.values(item.extractedVideos).flat().includes(selectedVideoFilter))
                    : results;
                    
                  return (
                    <SectionCard
                      title="Associated Flashcards"
                      icon={BookOpen}
                      theme="slate"
                      badgeText={`${displayedResults.length} results`}
                      headerRight={
                        selectedVideoFilter && (
                          <button 
                            onClick={() => setSelectedVideoFilter(null)}
                            className="text-xs flex items-center gap-1 bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-50 shadow-sm"
                          >
                            Clear Filter
                          </button>
                        )
                      }
                    >
                      <div className="divide-y divide-slate-100 max-h-[800px] overflow-y-auto">
                        {displayedResults.map((item, idx) => renderCardItem(item, `norm-${idx}`))}
                      </div>
                    </SectionCard>
                  );
                })()}

                {/* Syllabus Mode List */}
                {searchMode === 'syllabus' && (
                  <div>
                    {Object.entries(syllabusResults).map(([categoryName, items]) => {
                      const displayedItems = selectedVideoFilter 
                        ? items.filter(item => Object.values(item.extractedVideos).flat().includes(selectedVideoFilter))
                        : items;

                      if (displayedItems.length === 0) return null; 
                      
                      return (
                        <SectionCard
                          key={categoryName}
                          title={categoryName}
                          icon={AlignLeft}
                          theme="slate"
                          badgeText={`${displayedItems.length} results`}
                          headerRight={
                            selectedVideoFilter && (
                              <button 
                                onClick={() => setSelectedVideoFilter(null)}
                                className="text-xs flex items-center gap-1 bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded hover:bg-slate-50 shadow-sm"
                              >
                                Clear Filter
                              </button>
                            )
                          }
                        >
                          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                            {displayedItems.map((item, idx) => renderCardItem(item, `syl-${categoryName}-${idx}`))}
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

      {/* Configuration Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-end">
          <div className="bg-white w-full max-w-lg h-full p-6 flex flex-col justify-between shadow-2xl relative">
            <div>
              <div className="flex items-center justify-between border-b pb-4 border-slate-200 mb-6">
                <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-600" /> App Configurations
                </h2>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
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

                {/* Enable Resource Services */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Enabled Video Resources
                  </label>
                  <div className="space-y-2">
                    {Object.keys(preferences.enabledServices).map((service) => (
                      <label 
                        key={service}
                        className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        <input 
                          type="checkbox"
                          checked={preferences.enabledServices[service]}
                          onChange={() => {
                            const updatedServices = { ...preferences.enabledServices, [service]: !preferences.enabledServices[service] };
                            savePreferencesLocally({ ...preferences, enabledServices: updatedServices });
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span className="text-sm font-medium text-slate-700">{service}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Remote Deck URL sync */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Remote Deck Gist URL
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="https://raw.githubusercontent.com/.../AnKing.csv"
                      value={preferences.remoteDeckUrl}
                      onChange={(e) => setPreferences({ ...preferences, remoteDeckUrl: e.target.value })}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700"
                    />
                    <button
                      onClick={() => {
                        savePreferencesLocally(preferences);
                        fetchRemoteDeck(preferences.remoteDeckUrl);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-colors"
                    >
                      Sync Deck
                    </button>
                  </div>
                </div>

                {/* Local CSV Upload */}
                <div className="border-t pt-5 border-slate-100">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Fallback Local File Upload
                  </label>
                  <div className="relative border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="file" 
                      accept=".csv,.txt"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-700 block">Select CSV / TSV File</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 border-slate-200 flex justify-between text-[11px] text-slate-400 font-medium">
              <span>Standard Offline Mode Active</span>
              <span>Data stored locally</span>
            </div>
          </div>
        </div>
      )}

      {/* AI Quiz Modal */}
      {showQuizModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-indigo-50">
              <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                AI Mini-Quiz
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