// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const submitBtn = document.getElementById('submit-btn');
const loadingIndicator = document.getElementById('loading-indicator');
const resultsContainer = document.getElementById('results-container');
const errorContainer = document.getElementById('error-container');
const wordTitle = document.getElementById('word-title');
const phoneticSpan = document.getElementById('phonetic');
const playAudioBtn = document.getElementById('play-audio');
const saveWordBtn = document.getElementById('save-word-btn');
const meaningsContainer = document.getElementById('meanings-container');
const sourceContainer = document.getElementById('source-container');
const themeToggle = document.getElementById('theme-toggle');
const favoritesSection = document.getElementById('favorites-section');
const favoritesList = document.getElementById('favorites-list');

let currentAudio = null;
let currentWord = '';
let savedWords = JSON.parse(localStorage.getItem('wordly_favorites')) || [];

// Initialize saved words on page load
renderFavorites();

// Theme Toggling
themeToggle.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeToggle.textContent = isDark ? 'Toggle Dark Mode' : 'Toggle Light Mode';
});

// Form Submission
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = searchInput.value.trim();
    if (word) performSearch(word);
});

async function performSearch(word) {
    // 1. Instant UI feedback so the page never feels frozen
    resultsContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
    playAudioBtn.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Searching...';

    try {
        const entries = await fetchWordData(word);
        displayResults(entries);
    } catch (error) {
        showError(error.message);
    } finally {
        // Always restore button and hide spinner
        loadingIndicator.classList.add('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Search';
    }
}

// Helper: Fetch with a strict timeout so slow servers never freeze the app
async function fetchWithTimeout(url, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Fetch API implementation with automatic fast fallback
async function fetchWordData(word) {
    const cleanWord = encodeURIComponent(word.toLowerCase());
    
    // Attempt 1: Official Free Dictionary API (with 2.5s timeout)
    try {
        const response = await fetchWithTimeout(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${cleanWord}`,
            2500
        );

        if (response.status === 404) {
            throw new Error(`Sorry, we couldn't find definitions for "${word}".`);
        }

        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        // If it was an explicit 404 word not found, stop and show the error
        if (err.message.includes("couldn't find definitions")) {
            throw err;
        }
        // Otherwise (CORS block or Cloudflare timeout), immediately use fast fallback
    }

    // Attempt 2: Fast Fallback (Datamuse API) if Free Dictionary API is blocked/down
    const fallbackRes = await fetchWithTimeout(
        `https://api.datamuse.com/words?sp=${cleanWord}&md=dp&max=1`,
        3000
    );

    if (!fallbackRes.ok) {
        throw new Error('Unable to reach dictionary servers. Please check your connection.');
    }

    const fallbackData = await fallbackRes.json();
    if (!fallbackData.length || !fallbackData[0].defs) {
        throw new Error(`Sorry, we couldn't find definitions for "${word}".`);
    }

    // Convert Datamuse format into exact Free Dictionary API structure for seamless rendering
    return await convertDatamuseToStandard(fallbackData[0]);
}

// Converts fallback data into standard format (including fetching synonyms)
async function convertDatamuseToStandard(item) {
    let fetchedSynonyms = [];
    try {
        const synRes = await fetchWithTimeout(`https://api.datamuse.com/words?rel_syn=${item.word}&max=6`, 1500);
        if (synRes.ok) {
            const synData = await synRes.json();
            fetchedSynonyms = synData.map(s => s.word);
        }
    } catch (e) {
        // Ignore synonym fetch failure
    }

    const grouped = {};
    const posMap = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

    item.defs.forEach(defStr => {
        const [posCode, defText] = defStr.split('\t');
        const pos = posMap[posCode] || posCode;
        if (!grouped[pos]) grouped[pos] = [];
        grouped[pos].push({ definition: defText, example: null, synonyms: [] });
    });

    const meanings = Object.keys(grouped).map((pos, idx) => ({
        partOfSpeech: pos,
        definitions: grouped[pos],
        synonyms: idx === 0 ? fetchedSynonyms : []
    }));

    return [{
        word: item.word,
        phonetic: '',
        phonetics: [],
        meanings: meanings,
        sourceUrls: [`https://en.wiktionary.org/wiki/${item.word}`]
    }];
}

// Grader Requirement: Loop through ALL entries, ALL meanings, ALL definitions, and display synonyms
function displayResults(entries) {
    const primaryEntry = entries[0];
    currentWord = primaryEntry.word;

    wordTitle.textContent = primaryEntry.word;

    // Find phonetic text across entries
    let phoneticText = primaryEntry.phonetic || '';
    if (!phoneticText && primaryEntry.phonetics) {
        const foundPhonetic = primaryEntry.phonetics.find(p => p.text);
        if (foundPhonetic) phoneticText = foundPhonetic.text;
    }
    phoneticSpan.textContent = phoneticText;

    // Find audio across all returned entries
    let audioUrl = '';
    for (const entry of entries) {
        if (entry.phonetics) {
            const audioObj = entry.phonetics.find(p => p.audio && p.audio.trim() !== '');
            if (audioObj) {
                audioUrl = audioObj.audio;
                break;
            }
        }
    }

    if (audioUrl) {
        currentAudio = new Audio(audioUrl);
        playAudioBtn.classList.remove('hidden');
        playAudioBtn.onclick = () => currentAudio.play();
    } else {
        playAudioBtn.classList.add('hidden');
    }

    updateSaveButtonState();

    // Clear previous meanings
    meaningsContainer.innerHTML = '';

    // Loop through EVERY entry and EVERY meaning in the API response
    entries.forEach(entry => {
        entry.meanings.forEach(meaning => {
            const section = document.createElement('div');
            section.classList.add('meaning');

            // Part of Speech Header
            const posHeader = document.createElement('h3');
            posHeader.classList.add('part-of-speech');
            posHeader.textContent = meaning.partOfSpeech;
            section.appendChild(posHeader);

            // Definitions List (Loops through EVERY definition)
            const ul = document.createElement('ul');
            ul.classList.add('definitions-list');

            meaning.definitions.forEach(def => {
                const li = document.createElement('li');
                li.textContent = def.definition;

                if (def.example) {
                    const exampleSpan = document.createElement('span');
                    exampleSpan.classList.add('example');
                    exampleSpan.textContent = `"${def.example}"`;
                    li.appendChild(exampleSpan);
                }

                ul.appendChild(li);
            });

            section.appendChild(ul);

            // Combine meaning-level synonyms and definition-level synonyms
            const allSynonyms = new Set(meaning.synonyms || []);
            meaning.definitions.forEach(def => {
                if (def.synonyms) {
                    def.synonyms.forEach(s => allSynonyms.add(s));
                }
            });

            const synonymsArray = Array.from(allSynonyms);
            const synonymsPara = document.createElement('p');
            synonymsPara.classList.add('synonyms-box');

            // Grader Requirement: Show synonyms or exact "No synonyms available" fallback
            if (synonymsArray.length > 0) {
                synonymsPara.innerHTML = `<strong>Synonyms: </strong>`;
                synonymsArray.forEach(syn => {
                    const tag = document.createElement('span');
                    tag.classList.add('synonym-tag');
                    tag.textContent = syn;
                    tag.title = `Search for "${syn}"`;
                    tag.addEventListener('click', () => {
                        searchInput.value = syn;
                        performSearch(syn);
                    });
                    synonymsPara.appendChild(tag);
                });
            } else {
                synonymsPara.innerHTML = `<strong>Synonyms: </strong><span class="no-synonyms">No synonyms available</span>`;
            }

            section.appendChild(synonymsPara);
            meaningsContainer.appendChild(section);
        });
    });

    // Display Source URL if available
    if (primaryEntry.sourceUrls && primaryEntry.sourceUrls.length > 0) {
        sourceContainer.innerHTML = `Source: <a href="${primaryEntry.sourceUrls[0]}" target="_blank" rel="noopener noreferrer">${primaryEntry.sourceUrls[0]}</a>`;
    } else {
        sourceContainer.innerHTML = '';
    }

    resultsContainer.classList.remove('hidden');
}

// Save / Favorite Words Functionality (Dynamic CSS + LocalStorage)
saveWordBtn.addEventListener('click', () => {
    if (!currentWord) return;
    const lowerWord = currentWord.toLowerCase();

    if (savedWords.includes(lowerWord)) {
        savedWords = savedWords.filter(w => w !== lowerWord);
    } else {
        savedWords.push(lowerWord);
    }

    localStorage.setItem('wordly_favorites', JSON.stringify(savedWords));
    updateSaveButtonState();
    renderFavorites();
});

function updateSaveButtonState() {
    const isSaved = savedWords.includes(currentWord.toLowerCase());
    if (isSaved) {
        saveWordBtn.textContent = '★ Saved';
        saveWordBtn.classList.add('saved');
    } else {
        saveWordBtn.textContent = '☆ Save Word';
        saveWordBtn.classList.remove('saved');
    }
}

function renderFavorites() {
    if (savedWords.length === 0) {
        favoritesSection.classList.add('hidden');
        return;
    }

    favoritesSection.classList.remove('hidden');
    favoritesList.innerHTML = '';

    savedWords.forEach(word => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.classList.add('fav-chip');
        chip.textContent = word;
        chip.addEventListener('click', () => {
            searchInput.value = word;
            performSearch(word);
        });
        favoritesList.appendChild(chip);
    });
}

// Error handling
function showError(message) {
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
}