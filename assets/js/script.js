/**
 * Geographic Quiz Game - Core Engine
 * Handles data fetching, question generation, difficulty levels, and scoring
 */

// API Configuration
// IMPORTANT: On static hosting (e.g., GitHub Pages), do not expose API keys in client-side code.
// To keep this project keyless and static-friendly, we previously disabled Ninja API by default.
// At your request, Ninja API is now enabled below and the key is set.
// WARNING: Client-side keys are public. Prefer a serverless proxy for production.
const ENABLE_NINJA_API = true; // Enable direct Ninja API calls from the browser
const NINJA_API_KEY = 'yMeX7KaoDI7emt/c2uGp8w==7cVk5dAOuVFMhPIN';
const NINJA_API_BASE_URL = 'https://api.api-ninjas.com/v1';
const NINJA_RATE_DELAY_MS = 1100; // ~1 req/sec to respect free tier
const NINJA_MAX_INITIAL = 10; // smaller subset for faster first load

class QuizEngine {
  constructor() {
    this.countries = [];
    this.extendedData = [];
    this.currentQuestion = null;
    this.score = 0;
    this.wrong = 0;
    this.streak = 0;
    this.questionNumber = 0;
    this.totalQuestions = 10;
    this.difficulty = 'easy';
    this.answeredCurrentQuestion = false;
    this.apiKey = NINJA_API_KEY;
    this.difficultySettings = {
      easy: { countries: 30, popularOnly: true },
      medium: { countries: 100, popularOnly: false },
      hard: { countries: 200, popularOnly: false }
    };
  }

  /**
   * Initialize the quiz - fetch data and prepare questions
   */
  async init() {
    try {
      console.log('🚀 Initializing quiz...');

      // If Ninja API is disabled or no key, use REST Countries directly
      if (!ENABLE_NINJA_API || !this.apiKey) {
        await this.loadFromRestCountries();
      } else {
        // List of countries to fetch from Ninja API (we will pick a safe subset)
        const countryList = [
        'United States', 'China', 'India', 'Brazil', 'Russia', 'Japan', 'Germany', 'United Kingdom',
        'France', 'Italy', 'Canada', 'South Korea', 'Spain', 'Australia', 'Mexico', 'Indonesia',
        'Netherlands', 'Saudi Arabia', 'Turkey', 'Switzerland', 'Poland', 'Belgium', 'Sweden',
        'Argentina', 'Norway', 'Austria', 'United Arab Emirates', 'Ireland', 'Israel', 'Singapore',
        'Denmark', 'South Africa', 'Egypt', 'Philippines', 'Pakistan', 'Vietnam', 'Bangladesh',
        'Chile', 'Colombia', 'Finland', 'Portugal', 'Greece', 'New Zealand', 'Peru', 'Czech Republic',
        'Romania', 'Iraq', 'Qatar', 'Kazakhstan', 'Hungary', 'Kuwait', 'Morocco', 'Ukraine',
        'Ethiopia', 'Kenya', 'Ecuador', 'Guatemala', 'Tanzania', 'Panama', 'Croatia',
        'Lithuania', 'Slovenia', 'Serbia', 'Ghana', 'Tunisia', 'Bolivia', 'Paraguay',
        'Uganda', 'Latvia', 'Estonia', 'Nepal', 'Iceland', 'Cambodia', 'Cyprus', 'Zimbabwe',
        'Zambia', 'Albania', 'Mozambique', 'Jamaica', 'Malta', 'Mongolia', 'Armenia', 'Nicaragua'
        ];

  this.countries = [];

        // Choose a subset to respect rate limits
  const subset = this.shuffleArray(countryList).slice(0, NINJA_MAX_INITIAL);
  console.log(`📡 Fetching ${subset.length} countries from Ninja API (rate-limited)...`);
  // Notify UI about total work
  try { window.dispatchEvent(new CustomEvent('quizProgress', { detail: { current: 0, total: subset.length } })); } catch {}

        for (let i = 0; i < subset.length; i++) {
          const countryName = subset[i];
          try {
            const url = `${NINJA_API_BASE_URL}/country?name=${encodeURIComponent(countryName)}`;
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'X-Api-Key': this.apiKey, 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
              console.warn(`❌ Ninja fetch failed ${countryName}: ${response.status}`);
            } else {
              const data = await response.json();
              const mapped = this.mapNinjaCountry(data, countryName);
              if (mapped) this.countries.push(mapped);
            }
          } catch (err) {
            console.warn(`❌ Ninja error ${countryName}:`, err?.message || err);
          }
          // Notify UI progress
          try { window.dispatchEvent(new CustomEvent('quizProgress', { detail: { current: i + 1, total: subset.length } })); } catch {}

          // Rate limit delay
          if (i < subset.length - 1) await this.sleep(NINJA_RATE_DELAY_MS);
        }

        console.log(`✅ Loaded ${this.countries.length} countries from Ninja API (after rate limit)`);

        // If Ninja API fails completely, fallback to REST Countries API
        if (this.countries.length === 0) {
          console.warn('⚠️ Ninja API returned no data, using REST Countries API fallback');
          await this.loadFromRestCountries();
        }
      }
      
      // Sort by popularity for difficulty filtering
      this.countries.sort((a, b) => b.popularity - a.popularity);
      
      console.log('🎮 Quiz ready with', this.countries.length, 'countries');
      return true;
    } catch (error) {
      console.error('❌ Quiz initialization error:', error);
      // Fallback to REST Countries
      try {
        await this.loadFromRestCountries();
        return true;
      } catch (e) {
        console.error('❌ REST Countries fetch failed:', e);
        return false;
      }
    }
  }

  // Map Ninja API response to internal shape
  mapNinjaCountry(data, countryName) {
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    const country = data[0];
    const normalizedPopulation = this.normalizePopulation(country.population);
    const languages = Array.isArray(country.languages)
      ? country.languages
      : (typeof country.languages === 'string' && country.languages.length > 0
        ? country.languages.split(',').map(s => s.trim()).filter(Boolean)
        : ['Unknown']);
    const currencyName = country?.currency?.name || (typeof country?.currency === 'string' ? country.currency : 'Unknown');
    return {
      name: country.name || countryName,
      capital: country.capital || 'N/A',
      population: normalizedPopulation,
      area: country.surface_area || 0,
      region: country.region || 'Unknown',
      currencies: currencyName ? [currencyName] : ['Unknown'],
      gdp: country.gdp || 0,
      languages,
      timezones: [country.timezone || 'UTC'],
      flag: `https://flagcdn.com/w320/${this.getCountryCode(countryName)}.png`,
      flagAlt: `Flag of ${countryName}`,
      popularity: normalizedPopulation
    };
  }

  // Simple sleep/delay helper
  sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  /**
   * Fallback to REST Countries API if Ninja API fails
   */
  async loadFromRestCountries() {
    const response = await fetch('https://restcountries.com/v3.1/all');
    if (!response.ok) throw new Error('Failed to fetch countries');
    
    const data = await response.json();
    
    this.countries = data.map(country => ({
      name: country.name.common,
      capital: country.capital ? country.capital[0] : 'N/A',
      population: country.population || 0,
      area: country.area || 0,
      region: country.region || 'Unknown',
      languages: country.languages ? Object.values(country.languages) : [],
      currencies: country.currencies ? Object.values(country.currencies).map(c => c.name) : [],
      timezones: country.timezones || [],
      flag: country.flags?.png || country.flags?.svg || '',
      flagAlt: country.flags?.alt || `Flag of ${country.name.common}`,
      gdp: 0, // Not available in REST Countries
      popularity: country.population || 0
    })).filter(c => c.population > 0);
  }

  /**
   * Normalize population value from Ninja API to absolute person count
   * Handles strings with commas, and values given in thousands or millions
   */
  normalizePopulation(value) {
    if (value == null) return 0;

    let n;
    if (typeof value === 'string') {
      // Remove commas and spaces, handle decimal strings
      const cleaned = value.replace(/[,\s]/g, '');
      n = parseFloat(cleaned);
      if (Number.isNaN(n)) return 0;
    } else if (typeof value === 'number') {
      n = value;
    } else {
      return 0;
    }

    // If it's clearly already in persons (>= 1 million), return as-is
    if (n >= 1_000_000) return Math.round(n);

    // Heuristics:
    // - If less than 10, it's almost certainly in millions (e.g., 5.1 -> 5.1M)
    if (n < 10) return Math.round(n * 1_000_000);

    // - If between 10 and 10,000, assume thousands (e.g., 5,123 -> 5.123M)
    if (n < 10_000) return Math.round(n * 1_000);

    // Otherwise assume already absolute
    return Math.round(n);
  }

  /**
   * Get ISO country code for flag URL
   */
  getCountryCode(countryName) {
    const countryCodes = {
      'United States': 'us', 'China': 'cn', 'India': 'in', 'Brazil': 'br', 'Russia': 'ru',
      'Japan': 'jp', 'Germany': 'de', 'United Kingdom': 'gb', 'France': 'fr', 'Italy': 'it',
      'Canada': 'ca', 'South Korea': 'kr', 'Spain': 'es', 'Australia': 'au', 'Mexico': 'mx',
      'Indonesia': 'id', 'Netherlands': 'nl', 'Saudi Arabia': 'sa', 'Turkey': 'tr', 'Switzerland': 'ch',
      'Poland': 'pl', 'Belgium': 'be', 'Sweden': 'se', 'Argentina': 'ar', 'Norway': 'no',
      'Austria': 'at', 'United Arab Emirates': 'ae', 'Ireland': 'ie', 'Israel': 'il', 'Singapore': 'sg',
      'Denmark': 'dk', 'South Africa': 'za', 'Egypt': 'eg', 'Philippines': 'ph', 'Pakistan': 'pk',
      'Vietnam': 'vn', 'Bangladesh': 'bd', 'Chile': 'cl', 'Colombia': 'co', 'Finland': 'fi',
      'Portugal': 'pt', 'Greece': 'gr', 'New Zealand': 'nz', 'Peru': 'pe', 'Czech Republic': 'cz',
      'Romania': 'ro', 'Iraq': 'iq', 'Qatar': 'qa', 'Kazakhstan': 'kz', 'Hungary': 'hu',
      'Kuwait': 'kw', 'Morocco': 'ma', 'Ukraine': 'ua', 'Ethiopia': 'et', 'Kenya': 'ke',
      'Ecuador': 'ec', 'Dominican Republic': 'do', 'Guatemala': 'gt', 'Oman': 'om', 'Venezuela': 've',
      'Luxembourg': 'lu', 'Bulgaria': 'bg', 'Costa Rica': 'cr', 'Uruguay': 'uy', 'Croatia': 'hr',
      'Tanzania': 'tz', 'Lithuania': 'lt', 'Slovenia': 'si', 'Serbia': 'rs', 'Ghana': 'gh',
      'Jordan': 'jo', 'Tunisia': 'tn', 'Bolivia': 'bo', 'Ivory Coast': 'ci', 'Paraguay': 'py',
      'Libya': 'ly', 'Uganda': 'ug', 'Panama': 'pa', 'Latvia': 'lv', 'Estonia': 'ee',
      'Nepal': 'np', 'Cameroon': 'cm', 'Bahrain': 'bh', 'Honduras': 'hn', 'Iceland': 'is',
      'Trinidad and Tobago': 'tt', 'Senegal': 'sn', 'Cambodia': 'kh', 'Cyprus': 'cy', 'Zimbabwe': 'zw',
      'Papua New Guinea': 'pg', 'Zambia': 'zm', 'Albania': 'al', 'Mozambique': 'mz', 'Botswana': 'bw',
      'Gabon': 'ga', 'Jamaica': 'jm', 'Malta': 'mt', 'Mauritius': 'mu', 'Brunei': 'bn',
      'Mongolia': 'mn', 'Armenia': 'am', 'Namibia': 'na', 'Madagascar': 'mg', 'Nicaragua': 'ni',
      'Macedonia': 'mk', 'Burkina Faso': 'bf', 'Mali': 'ml', 'Bahamas': 'bs', 'Haiti': 'ht',
      'Benin': 'bj', 'Rwanda': 'rw', 'Niger': 'ne', 'Guinea': 'gn', 'Malawi': 'mw',
      'Tajikistan': 'tj', 'Montenegro': 'me', 'Kosovo': 'xk', 'Kyrgyzstan': 'kg', 'Moldova': 'md',
      'Barbados': 'bb', 'Fiji': 'fj', 'Togo': 'tg', 'Liberia': 'lr', 'Mauritania': 'mr',
      'Suriname': 'sr', 'Maldives': 'mv', 'Guyana': 'gy'
    };
    return countryCodes[countryName] || 'un';
  }

  /**
   * Get filtered countries based on difficulty
   */
  getCountriesForDifficulty() {
    const settings = this.difficultySettings[this.difficulty];
    let pool = this.countries;
    
    if (settings.popularOnly) {
      pool = this.countries.slice(0, 50); // Top 50 popular countries
    }
    
    return pool.slice(0, settings.countries);
  }

  /**
   * Generate a new question based on difficulty and question types
   * Only includes Ninja API question types
   */
  generateQuestion() {
    const questionTypes = [
      'population',
      'area',
      'gdp',
      'capital',
      'currency',
      'languages',
      'timezone',
      'flag'
    ];

    const type = questionTypes[Math.floor(Math.random() * questionTypes.length)];
    const pool = this.getCountriesForDifficulty();
    
    return this.generateMultipleChoiceQuestion(type, pool);
  }

  /**
   * Generate a multiple choice question
   */
  generateMultipleChoiceQuestion(type, pool) {
    const country = pool[Math.floor(Math.random() * pool.length)];
    let question, correctAnswer, options, explanation, media;

    switch (type) {
      case 'population':
        question = `What is the approximate population of ${country.name}?`;
        correctAnswer = this.formatPopulation(country.population);
        options = this.generatePopulationOptions(country.population, pool);
        explanation = `${country.name} has a population of approximately ${correctAnswer}.`;
        break;

      case 'area':
        question = `What is the total land area of ${country.name} in square kilometers?`;
        correctAnswer = this.formatArea(country.area);
        options = this.generateAreaOptions(country.area, pool);
        explanation = `${country.name} has a total area of ${correctAnswer}.`;
        break;

      case 'gdp':
        question = `What is the approximate GDP of ${country.name}?`;
        correctAnswer = this.formatGDP(country.population * 15000); // Rough estimate based on population
        options = this.generateGDPOptions(country.population * 15000, pool);
        explanation = `${country.name} has an estimated GDP of approximately ${correctAnswer}.`;
        break;

      case 'capital':
        question = `What is the capital city of ${country.name}?`;
        correctAnswer = country.capital;
        options = this.generateCapitalOptions(country, pool);
        explanation = `The capital of ${country.name} is ${correctAnswer}.`;
        break;

      case 'currency':
        question = `What currency is used in ${country.name}?`;
        correctAnswer = country.currencies[0] || 'Unknown';
        options = this.generateCurrencyOptions(country, pool);
        explanation = `${country.name} uses ${correctAnswer}.`;
        break;

      case 'languages':
        question = `Which languages are spoken in ${country.name}?`;
        correctAnswer = country.languages[0] || 'Unknown';
        options = this.generateLanguageOptions(country, pool);
        explanation = `${correctAnswer} is one of the official languages spoken in ${country.name}.`;
        break;

      case 'timezone':
        question = `What is the time zone of ${country.name}?`;
        correctAnswer = country.timezones[0];
        options = this.generateTimezoneOptions(country, pool);
        explanation = `The time zone of ${country.name} is ${correctAnswer}.`;
        break;

      case 'flag':
        question = `What does the flag of ${country.name} look like?`;
        correctAnswer = country.flag;
        options = this.generateFlagOptions(country, pool);
        explanation = `This is what the flag of ${country.name} looks like.`;
        media = { type: 'flags', options: options };
        break;
    }

    return {
      type,
      question,
      correctAnswer,
      options: this.shuffleArray(options),
      explanation,
      media,
      country: country.name
    };
  }

  /**
   * Generate distractor options for population questions
   */
  generatePopulationOptions(correctPop, pool) {
    const options = [this.formatPopulation(correctPop)];
    const multipliers = this.difficulty === 'easy' ? [0.5, 2, 5] : 
                        this.difficulty === 'medium' ? [0.7, 1.5, 3] : 
                        [0.85, 1.15, 1.4];

    multipliers.forEach(mult => {
      options.push(this.formatPopulation(Math.floor(correctPop * mult)));
    });

    return options;
  }

  /**
   * Generate distractor options for area questions
   */
  generateAreaOptions(correctArea, pool) {
    const options = [this.formatArea(correctArea)];
    const multipliers = this.difficulty === 'easy' ? [0.4, 2.5, 6] : 
                        this.difficulty === 'medium' ? [0.6, 1.7, 3.5] : 
                        [0.8, 1.2, 1.6];

    multipliers.forEach(mult => {
      options.push(this.formatArea(Math.floor(correctArea * mult)));
    });

    return options;
  }

  /**
   * Generate distractor options for GDP questions
   */
  generateGDPOptions(correctGDP, pool) {
    const options = [this.formatGDP(correctGDP)];
    const multipliers = this.difficulty === 'easy' ? [0.3, 2, 7] : 
                        this.difficulty === 'medium' ? [0.5, 1.8, 4] : 
                        [0.75, 1.25, 1.9];

    multipliers.forEach(mult => {
      options.push(this.formatGDP(Math.floor(correctGDP * mult)));
    });

    return options;
  }

  /**
   * Generate distractor options for capital questions
   */
  generateCapitalOptions(country, pool) {
    const options = [country.capital];
    const otherCapitals = pool
      .filter(c => c.name !== country.name && c.capital !== 'N/A')
      .map(c => c.capital);

    while (options.length < 4 && otherCapitals.length > 0) {
      const idx = Math.floor(Math.random() * otherCapitals.length);
      const capital = otherCapitals.splice(idx, 1)[0];
      if (!options.includes(capital)) {
        options.push(capital);
      }
    }

    return options;
  }

  /**
   * Generate distractor options for currency questions
   */
  generateCurrencyOptions(country, pool) {
    const options = [country.currencies[0]];
    const otherCurrencies = pool
      .filter(c => c.name !== country.name && c.currencies.length > 0)
      .flatMap(c => c.currencies);

    while (options.length < 4 && otherCurrencies.length > 0) {
      const idx = Math.floor(Math.random() * otherCurrencies.length);
      const currency = otherCurrencies.splice(idx, 1)[0];
      if (!options.includes(currency)) {
        options.push(currency);
      }
    }

    return options;
  }

  /**
   * Generate distractor options for language questions
   */
  generateLanguageOptions(country, pool) {
    const options = [];
    const correct = (country.languages && country.languages[0]) || 'Unknown';
    if (correct !== 'Unknown') options.push(correct);

    // Collect languages from other countries
    const otherLanguages = pool
      .filter(c => c.name !== country.name && Array.isArray(c.languages) && c.languages.length > 0)
      .flatMap(c => c.languages)
      .filter(l => l && l !== 'Unknown');

    // Fallback common languages list
    const common = [
      'English', 'Spanish', 'French', 'Arabic', 'Hindi', 'Bengali', 'Portuguese', 'Russian',
      'German', 'Japanese', 'Turkish', 'Italian', 'Korean', 'Vietnamese', 'Urdu', 'Persian'
    ];

    // Merge and dedupe pool + common languages
    const languagePool = [...new Set([...otherLanguages, ...common])].filter(l => l !== correct);

    // Randomly pick until we have 4 options total
    while (options.length < 4 && languagePool.length > 0) {
      const idx = Math.floor(Math.random() * languagePool.length);
      const pick = languagePool.splice(idx, 1)[0];
      if (!options.includes(pick)) options.push(pick);
    }

    // Absolute fallback: pad with common languages not yet used
    let i = 0;
    while (options.length < 4 && i < common.length) {
      const l = common[i++];
      if (l !== correct && !options.includes(l)) options.push(l);
    }

    // If correct was 'Unknown', replace first slot with a safe common language to avoid bad UX
    if (correct === 'Unknown' && options.length > 0 && !options.includes('English')) {
      options[0] = 'English';
    }

    return options;
  }

  /**
   * Generate distractor options for timezone questions
   */
  generateTimezoneOptions(country, pool) {
    const options = [country.timezones[0]];
   
     // Common timezones to use as distractors
     const commonTimezones = [
       'UTC', 'UTC+01:00', 'UTC+02:00', 'UTC+03:00', 'UTC+04:00', 'UTC+05:00', 
       'UTC+05:30', 'UTC+06:00', 'UTC+07:00', 'UTC+08:00', 'UTC+09:00', 'UTC+10:00',
       'UTC-05:00', 'UTC-04:00', 'UTC-03:00', 'UTC-06:00', 'UTC-07:00', 'UTC-08:00',
       'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
       'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
       'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata',
       'Australia/Sydney', 'Pacific/Auckland'
     ];
   
     // Get other timezones from pool
     const otherTimezones = pool
       .filter(c => c.name !== country.name && c.timezones && c.timezones.length > 0)
       .flatMap(c => c.timezones);
   
     // Combine pool timezones with common ones
     const allTimezones = [...new Set([...otherTimezones, ...commonTimezones])];
   
     // Shuffle and pick different options
     while (options.length < 4 && allTimezones.length > 0) {
       const idx = Math.floor(Math.random() * allTimezones.length);
       const timezone = allTimezones.splice(idx, 1)[0];
       if (!options.includes(timezone)) {
         options.push(timezone);
       }
     }
   
     // Fallback if we still don't have enough
     while (options.length < 4) {
       const fallback = `UTC+${Math.floor(Math.random() * 12)}:00`;
       if (!options.includes(fallback)) {
         options.push(fallback);
       }
     }

     return options;
  }

  /**
   * Generate distractor options for flag questions
   */
  generateFlagOptions(country, pool) {
    const options = [{ name: country.name, flag: country.flag, alt: country.flagAlt }];
    const otherCountries = pool.filter(c => c.name !== country.name && c.flag);

    while (options.length < 4 && otherCountries.length > 0) {
      const idx = Math.floor(Math.random() * otherCountries.length);
      const other = otherCountries.splice(idx, 1)[0];
      options.push({ name: other.name, flag: other.flag, alt: other.flagAlt });
    }

    return options;
  }

  /**
   * Format population number
   */
  formatPopulation(pop) {
    if (pop >= 1_000_000_000) {
      return `${(pop / 1_000_000_000).toFixed(2)} billion`;
    }
    if (pop >= 1_000_000) {
      return `${(pop / 1_000_000).toFixed(1)} million`;
    }
    // For values under 1 million, show exact number with commas (avoid "thousand" wording)
    return pop.toLocaleString();
  }

  /**
   * Format area number
   */
  formatArea(area) {
    return `${area.toLocaleString()} km²`;
  }

  /**
   * Format GDP number
   */
  formatGDP(gdp) {
    if (gdp >= 1000000000000) {
      return `$${(gdp / 1000000000000).toFixed(2)} trillion`;
    } else if (gdp >= 1000000000) {
      return `$${(gdp / 1000000000).toFixed(1)} billion`;
    } else if (gdp >= 1000000) {
      return `$${(gdp / 1000000).toFixed(0)} million`;
    }
    return `$${gdp.toLocaleString()}`;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Check if answer is correct
   */
  checkAnswer(userAnswer) {
    const isCorrect = userAnswer === this.currentQuestion.correctAnswer;
    
    if (isCorrect) {
      this.score++;
      this.streak++;
      
      // Streak bonus after 3 consecutive correct answers
      if (this.streak >= 3 && this.streak % 3 === 0) {
        this.score++;
      }
    } else {
      this.wrong++;
      this.streak = 0;
    }

    this.answeredCurrentQuestion = true;
    
    return {
      isCorrect,
      streak: this.streak,
      explanation: this.currentQuestion.explanation
    };
  }

  /**
   * Move to next question
   */
  nextQuestion() {
    if (this.questionNumber >= this.totalQuestions) {
      return null; // Quiz complete
    }

    this.questionNumber++;
    this.currentQuestion = this.generateQuestion();
    this.answeredCurrentQuestion = false;
    
    return this.currentQuestion;
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      score: this.score,
      wrong: this.wrong,
      streak: this.streak,
      questionNumber: this.questionNumber,
      totalQuestions: this.totalQuestions,
      percentage: Math.round((this.score / this.questionNumber) * 100) || 0
    };
  }

  /**
   * Reset quiz
   */
  reset() {
    this.score = 0;
    this.wrong = 0;
    this.streak = 0;
    this.questionNumber = 0;
    this.currentQuestion = null;
    this.answeredCurrentQuestion = false;
  }

  /**
   * Change difficulty
   */
  setDifficulty(level) {
    if (this.difficultySettings[level]) {
      this.difficulty = level;
      this.reset();
    }
  }
}

// Export for use in quiz.js
window.QuizEngine = QuizEngine;
