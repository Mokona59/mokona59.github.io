var animationLoopStarted = false;
var animationFrameId = null;
var characterFadeOutTimer = null;

function getCharacterMessage(key) {
	var messages = {
		en: {
			show: 'Show Teto',
			hide: 'Hide Teto',
			loading: 'Loading Teto',
			loadingTitle: 'Loading Teto…',
			loadError: 'Teto failed to load',
			loadErrorTitle: 'Teto failed to load. Try again.',
			farewell: 'Teto is waving goodbye',
		},
		fr: {
			show: 'Afficher Teto',
			hide: 'Masquer Teto',
				loading: 'Chargement de Teto',
				loadingTitle: 'Chargement de Teto…',
			loadError: 'Échec du chargement de Teto',
			loadErrorTitle: 'Impossible de charger Teto. Réessayez.',
			farewell: 'Teto vous dit au revoir',
		},
	};
	var language = document.documentElement.lang.toLowerCase().split('-')[0];
	var localizedMessages = messages[language] || messages.en;
	return localizedMessages[key];
}

function update() {
	if (!animationLoopStarted) return;
	animationFrameId = requestAnimationFrame(update);

	if (ready && !document.hidden) {
		var delta = Math.min(clock.getDelta(), maximumFrameDelta);
		helper.animate(delta);
		manageMove(delta);
	}

	effect.render(scene, camera);
	if (ready && startupSequenceState === 'awaiting-render') {
		startupSequenceState = 'fade-in';
	}
}

function startAnimationLoop() {
	if (animationLoopStarted) return;
	animationLoopStarted = true;
	clock.start();
	update();
}

function resetCharacterButton() {
	if (!loadCharacterButton) return;

	loadCharacterButton.disabled = false;
	loadCharacterButton.classList.remove(
		'is-loading',
		'is-loaded',
		'is-unloading',
		'is-error',
	);
	loadCharacterButton.setAttribute('aria-expanded', 'false');
	loadCharacterButton.setAttribute('aria-pressed', 'false');
	loadCharacterButton.setAttribute('aria-label', getCharacterMessage('show'));
	loadCharacterButton.removeAttribute('title');
}

function showCharacterLoadError(error) {
	console.error('Could not load the character.', error);
	if (characterFadeOutTimer !== null) {
		window.clearTimeout(characterFadeOutTimer);
		characterFadeOutTimer = null;
	}
	unloadCharacter();
	characterLifecycle = 'hidden';

	if (!loadCharacterButton) return;
	loadCharacterButton.disabled = false;
	loadCharacterButton.classList.remove('is-loading', 'is-loaded', 'is-unloading');
	loadCharacterButton.classList.add('is-error');
	loadCharacterButton.setAttribute('aria-expanded', 'false');
	loadCharacterButton.setAttribute('aria-pressed', 'false');
	loadCharacterButton.setAttribute(
		'aria-label',
		getCharacterMessage('loadError'),
	);
	loadCharacterButton.title = getCharacterMessage('loadErrorTitle');
}

function beginCharacterFarewell() {
	if (characterLifecycle !== 'active' || !ready) return;

	var mesh = helper.meshes[0];
	disposeCharacterDragging();
	stopIdleMotion(mesh);

	motionStatus.inWalking = false;
	motionStatus.inStartWalking = false;
	motionStatus.inStopWalking = false;
	motionStatus.inMovingLeft = false;
	motionStatus.inMovingRight = false;
	motionStatus.inJumping = false;
	motionStatus.jumpVelocity = 0;
	pendingFallIdle = false;
	isJumpFalling = false;
	waveGraceRemaining = 0;
	startupSequenceState = 'complete';

	characterLifecycle = 'farewell-stopping';
}

function beginCharacterFadeOut() {
	if (characterLifecycle !== 'farewell') return;

	characterLifecycle = 'fading';
	if (container && renderer) {
		renderer.domElement.style.removeProperty('opacity');
		container.classList.add('is-fading-out');
	}

	characterFadeOutTimer = window.setTimeout(function () {
		characterFadeOutTimer = null;
		unloadCharacter();
		characterLifecycle = 'hidden';
		resetCharacterButton();
	}, 1000);
}

var loadCharacterButton = document.getElementById('load-character-button');
if (loadCharacterButton) {
	function startCharacterLoading() {
		if (characterLifecycle !== 'hidden') return;

		characterLifecycle = 'loading';
		loadCharacterButton.disabled = true;
		loadCharacterButton.classList.remove('is-error', 'is-unloading');
		loadCharacterButton.classList.add('is-loading');
		loadCharacterButton.setAttribute(
			'aria-label',
			getCharacterMessage('loading'),
		);
		loadCharacterButton.title = getCharacterMessage('loadingTitle');

		try {
			init(function () {
				characterLifecycle = 'active';
				loadCharacterButton.disabled = false;
				loadCharacterButton.classList.remove('is-loading', 'is-error');
				loadCharacterButton.classList.add('is-loaded');
				loadCharacterButton.setAttribute('aria-expanded', 'true');
				loadCharacterButton.setAttribute('aria-pressed', 'true');
				loadCharacterButton.setAttribute(
					'aria-label',
					getCharacterMessage('hide'),
				);
				loadCharacterButton.title = getCharacterMessage('hide');
			});
			startAnimationLoop();
		} catch (error) {
			showCharacterLoadError(error);
		}
	}

	loadCharacterButton.addEventListener('click', function () {
		if (loadCharacterButton.disabled) return;

		if (characterLifecycle === 'active') {
			loadCharacterButton.disabled = true;
			loadCharacterButton.classList.add('is-unloading');
			loadCharacterButton.setAttribute(
				'aria-label',
				getCharacterMessage('farewell'),
			);
			beginCharacterFarewell();
			return;
		}

		startCharacterLoading();
	});

	var languageSwitches = document.querySelectorAll(
		'.lang-btn--en, .lang-btn--fr',
	);
	languageSwitches.forEach(function (link) {
		link.addEventListener('click', function (event) {
			if (
				characterLifecycle !== 'active' &&
				characterLifecycle !== 'loading'
			) {
				return;
			}
			if (
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			) {
				return;
			}

			var target = new URL(link.href, document.baseURI);
			target.searchParams.set('teto', '1');
			event.preventDefault();
			window.location.assign(target.href);
		});
	});

	var currentUrl = new URL(window.location.href);
	if (currentUrl.searchParams.get('teto') === '1') {
		currentUrl.searchParams.delete('teto');
		window.history.replaceState(
			null,
			'',
			currentUrl.pathname + currentUrl.search + currentUrl.hash,
		);
		startCharacterLoading();
	}

	window.addEventListener('character-load-error', function (event) {
		if (characterLifecycle !== 'loading') return;
		showCharacterLoadError(event.detail);
	});
} else {
	characterLifecycle = 'loading';
	init(function () {
		characterLifecycle = 'active';
	});
	startAnimationLoop();
}

document.addEventListener('visibilitychange', function () {
	if (!document.hidden) clock.start();
});

window.addEventListener('blur', function () {
	clock.stop();
});

window.addEventListener('focus', function () {
	if (!document.hidden) clock.start();
});
