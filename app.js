// DOM Elements
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');
const errorContainer = document.getElementById('error-container');
const wordTitle = document.getElementById('word-title');
const phoneticSpan = document.getElementById('phonetic');
const playAudioBtn = document.getElementById('play-audio');
const meaningsContainer = document.getElementById('meanings-container');
const themeToggle = document.getElementById('theme-toggle');

// Theme Toggling Logic
themeToggle.addEventListener('click', () => {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
});

// Form Submission handling
searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const word = searchInput.value.trim();
    
    if (!word) return;

    // Reset UI
    resultsContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
    playAudioBtn.classList.add('hidden'); // Datamuse doesn't provide audio files

    try {
        const data = await fetchWordData(word);
        displayResults(data, word);
    } catch (error) {
        showError(error.message);
    }
});

// Fetch API implementation using Datamuse (No CORS issues)
async function fetchWordData(word) {
    const response = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
    
    if (!response.ok) {
        throw new Error("An error occurred while connecting to the dictionary. Please try again.");
    }
    
    const data = await response.json();
    
    // Datamuse returns an empty array or an array without 'defs' if the word isn't found
    if (data.length === 0 || !data[0].defs) {
        throw new Error(`Sorry, we couldn't find definitions for the word "${word}".`);
    }
    
    return data[0];
}

// DOM Manipulation to display data
function displayResults(data, searchedWord) {
    wordTitle.textContent = data.word || searchedWord;
    phoneticSpan.textContent = ''; // Clear phonetic as Datamuse focuses on definitions

    // Clear previous meanings
    meaningsContainer.innerHTML = '';

    const section = document.createElement('div');
    section.classList.add('meaning');

    const ul = document.createElement('ul');
    
    // Datamuse formats definitions as "partOfSpeech\tdefinition" (e.g., "n\ta greeting")
    data.defs.forEach(defString => {
        const parts = defString.split('\t');
        const partOfSpeech = parts[0];
        const definition = parts[1];

        const li = document.createElement('li');
        
        // Map the abbreviation to a full word for better UI
        let posFull = partOfSpeech;
        if (posFull === 'n') posFull = 'noun';
        if (posFull === 'v') posFull = 'verb';
        if (posFull === 'adj') posFull = 'adjective';
        if (posFull === 'adv') posFull = 'adverb';

        li.innerHTML = `<span class="part-of-speech" style="display:inline; margin-right:8px;">${posFull}</span> ${definition}`;
        ul.appendChild(li);
    });

    section.appendChild(ul);
    meaningsContainer.appendChild(section);

    // Reveal results
    resultsContainer.classList.remove('hidden');
}

// Error handling
function showError(message) {
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
}