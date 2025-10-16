/**
 * Geographic Quiz Game - UI Controller
 * Handles DOM manipulation, user interactions, and visual feedback
 */

class QuizUI {
  constructor() {
    this.engine = new QuizEngine();
    this.elements = {};
    this.isAnswered = false;
    this.selectedOption = null;
  }

  /**
   * Initialize UI and bind events
   */
  async init() {
    // Cache DOM elements
    this.elements = {
      question: document.getElementById('question'),
      media: document.getElementById('media'),
      options: document.getElementById('options'),
      feedback: document.getElementById('feedback'),
      score: document.getElementById('score'),
      wrong: document.getElementById('wrong'),
      progress: document.getElementById('progress'),
      nextBtn: document.getElementById('next-btn'),
      restartBtn: document.getElementById('restart-btn'),
      difficulty: document.getElementById('difficulty')
    };

    // Show loading state
    this.showLoading();

    // Progress from engine (e.g., Ninja API fetch progress)
    const onProgress = (evt) => {
      try {
        const { current, total } = evt.detail || {};
        if (typeof current === 'number' && typeof total === 'number' && total > 0) {
          if (this.elements.question) this.elements.question.textContent = `Loading quiz data… (${current}/${total})`;
          if (this.elements.feedback) this.elements.feedback.textContent = `Fetching countries (${current} of ${total})`;
        }
      } catch {}
    };
    window.addEventListener('quizProgress', onProgress);

    // Initialize quiz engine
    const success = await this.engine.init();
    
    if (!success) {
      this.showError('Failed to load quiz data. Please refresh the page.');
      window.removeEventListener('quizProgress', onProgress);
      return;
    }

    // Bind events
    this.bindEvents();

    // Start first question
    this.loadNextQuestion();
    window.removeEventListener('quizProgress', onProgress);
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Next button
    if (this.elements.nextBtn) {
      this.elements.nextBtn.addEventListener('click', () => this.handleNext());
    }

    // Restart button
    if (this.elements.restartBtn) {
      this.elements.restartBtn.addEventListener('click', () => this.handleRestart());
    }

    // Difficulty selector
    if (this.elements.difficulty) {
      this.elements.difficulty.addEventListener('change', (e) => {
        const difficulty = e.target.value;
        this.engine.setDifficulty(difficulty);
        this.handleRestart();
      });
    }

    // Keyboard shortcuts (1-4 for options)
    document.addEventListener('keydown', (e) => {
      if (this.isAnswered) return;

      const key = parseInt(e.key);
      if (key >= 1 && key <= 4) {
        const optionBtns = this.elements.options.querySelectorAll('.option');
        if (optionBtns[key - 1]) {
          optionBtns[key - 1].click();
        }
      }
    });

    // Keyboard shortcut for next (Enter/Space)
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !this.elements.nextBtn.disabled) {
        e.preventDefault();
        this.handleNext();
      }
    });
  }

  /**
   * Load next question
   */
  loadNextQuestion() {
    const question = this.engine.nextQuestion();
    
    if (!question) {
      this.showSummary();
      return;
    }

    this.isAnswered = false;
    this.selectedOption = null;
    this.renderQuestion(question);
    this.updateStats();
    
    // Hide next button initially
    this.elements.nextBtn.disabled = true;
    this.elements.feedback.textContent = '';
  }

  /**
   * Render question to DOM
   */
  renderQuestion(question) {
    // Update question text
    this.elements.question.textContent = question.question;

    // Clear previous media and options
    this.elements.media.innerHTML = '';
    this.elements.options.innerHTML = '';

    // Render media if present (e.g., flags)
    if (question.media && question.media.type === 'flags') {
      this.renderFlagOptions(question);
    } else {
      this.renderTextOptions(question);
    }
  }

  /**
   * Render text-based options
   */
  renderTextOptions(question) {
    question.options.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn option';
      btn.textContent = option;
      btn.setAttribute('role', 'option');
      btn.setAttribute('data-answer', option);
      btn.setAttribute('aria-label', `Option ${index + 1}: ${option}`);
      
      btn.addEventListener('click', () => this.handleAnswer(option, btn));
      
      this.elements.options.appendChild(btn);
    });
  }

  /**
   * Render flag-based options
   */
  renderFlagOptions(question) {
    const flagContainer = document.createElement('div');
    flagContainer.className = 'quiz__flags';
    
    question.media.options.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.className = 'btn option option--flag';
      btn.setAttribute('role', 'option');
      btn.setAttribute('data-answer', item.flag);
      btn.setAttribute('aria-label', `Option ${index + 1}: ${item.alt || 'Flag option'}`);
      
      const img = document.createElement('img');
      img.src = item.flag;
      img.alt = item.alt || `Flag of ${item.name}`;
      img.loading = 'lazy';
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.maxHeight = '100px';
      img.style.objectFit = 'contain';
      
      btn.appendChild(img);
      btn.addEventListener('click', () => this.handleAnswer(item.flag, btn));
      
      flagContainer.appendChild(btn);
    });
    
    this.elements.options.appendChild(flagContainer);
  }

  /**
   * Handle answer selection
   */
  handleAnswer(userAnswer, button) {
    if (this.isAnswered) return; // Prevent multiple answers

    this.isAnswered = true;
    this.selectedOption = button;

    const result = this.engine.checkAnswer(userAnswer);
    
    // Visual feedback
    if (result.isCorrect) {
      button.classList.add('correct');
      this.showFeedback(true, result.explanation, result.streak);
    } else {
      button.classList.add('wrong');
      this.highlightCorrectAnswer();
      this.showFeedback(false, result.explanation);
    }

    // Disable all option buttons
    const allOptions = this.elements.options.querySelectorAll('.option');
    allOptions.forEach(btn => btn.disabled = true);

    // Enable next button
    this.elements.nextBtn.disabled = false;
    this.elements.nextBtn.focus();

    // Update stats
    this.updateStats();
  }

  /**
   * Highlight correct answer after wrong selection
   */
  highlightCorrectAnswer() {
    const correctAnswer = this.engine.currentQuestion.correctAnswer;
    const allOptions = this.elements.options.querySelectorAll('.option');
    
    allOptions.forEach(btn => {
      const answer = btn.getAttribute('data-answer') || 
                     (btn.querySelector('img')?.src);
      if (answer === correctAnswer) {
        btn.classList.add('correct');
      }
    });
  }

  /**
   * Show feedback message
   */
  showFeedback(isCorrect, explanation, streak = 0) {
    let message = isCorrect ? '✅ Correct! ' : '❌ Wrong. ';
    message += explanation;
    
    if (streak >= 3 && streak % 3 === 0) {
      message += ` 🔥 ${streak}-answer streak bonus!`;
    }

    this.elements.feedback.textContent = message;
    this.elements.feedback.style.color = isCorrect ? '#16a34a' : '#dc2626';
  }

  /**
   * Update stats display
   */
  updateStats() {
    const stats = this.engine.getStats();
    
    this.elements.score.textContent = stats.score;
    this.elements.wrong.textContent = stats.wrong;
    this.elements.progress.textContent = `${stats.questionNumber} / ${stats.totalQuestions}`;
  }

  /**
   * Handle next button click
   */
  handleNext() {
    this.loadNextQuestion();
  }

  /**
   * Handle restart button click
   */
  handleRestart() {
    this.engine.reset();
    this.elements.restartBtn.hidden = true;
    this.elements.nextBtn.hidden = false;
    this.updateStats();
    this.loadNextQuestion();
  }

  /**
   * Show quiz summary
   */
  showSummary() {
    const stats = this.engine.getStats();
    
    this.elements.question.textContent = '🎉 Quiz Complete!';
    this.elements.options.innerHTML = '';
    this.elements.media.innerHTML = '';
    
    const summary = document.createElement('div');
    summary.className = 'quiz__summary';
    summary.innerHTML = `
      <div class="summary-card">
        <h3>Your Results</h3>
        <div class="summary-stats">
          <div class="stat">
            <span class="stat-label">Correct</span>
            <span class="stat-value stat-value--correct">${stats.score}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Wrong</span>
            <span class="stat-value stat-value--wrong">${stats.wrong}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Accuracy</span>
            <span class="stat-value">${stats.percentage}%</span>
          </div>
        </div>
        <p class="summary-message">${this.getSummaryMessage(stats.percentage)}</p>
      </div>
    `;
    
    this.elements.options.appendChild(summary);
    this.elements.feedback.textContent = '';
    
    // Show restart button, hide next
    this.elements.nextBtn.hidden = true;
    this.elements.restartBtn.hidden = false;
    this.elements.restartBtn.focus();
  }

  /**
   * Get encouraging summary message based on performance
   */
  getSummaryMessage(percentage) {
    if (percentage >= 90) return '🏆 Outstanding! You\'re a geography master!';
    if (percentage >= 75) return '🌟 Great job! You know your world geography!';
    if (percentage >= 60) return '👍 Good effort! Keep learning!';
    if (percentage >= 40) return '📚 Not bad! Practice makes perfect!';
    return '💪 Keep trying! Geography is fascinating!';
  }

  /**
   * Show loading state
   */
  showLoading() {
    this.elements.question.textContent = 'Loading quiz data...';
    this.elements.options.innerHTML = '<div class="loading">Please wait...</div>';
  }

  /**
   * Show error message
   */
  showError(message) {
    this.elements.question.textContent = 'Error';
    this.elements.options.innerHTML = `<div class="error">${message}</div>`;
  }
}

// Initialize quiz when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const quiz = new QuizUI();
    quiz.init();
  });
} else {
  const quiz = new QuizUI();
  quiz.init();
}
