function startMotion(mesh, key) {
	var name = key;
	mesh.mixer.clipAction(name).play();
	var morphAction = mesh.mixer.clipAction(name + 'Morph');
	if (morphAction) morphAction.play();
}

function stopMotion(mesh, key) {
	var name = key;
	mesh.mixer.clipAction(name).stop();
	var morphAction = mesh.mixer.clipAction(name + 'Morph');
	if (morphAction) morphAction.stop();
}

function startBlink(mesh) {
	mesh.mixer.clipAction('blinkMorph').play();
}

function stopBlink(mesh) {
	mesh.mixer.clipAction('blinkMorph').stop();
}

function initializeStartupFade() {
	startupFadeElapsed = 0;
	renderer.domElement.style.opacity = '0';
}

function updateStartupFade(delta) {
	startupFadeElapsed = Math.min(
		startupFadeDuration,
		startupFadeElapsed + delta,
	);
	var progress = startupFadeElapsed / startupFadeDuration;
	renderer.domElement.style.opacity = String(progress);

	if (progress < 1) return false;

	return true;
}

function startWalking(mesh) {
	var action = mesh.mixer.clipAction('walk');
	action.reset();
	action.setLoop(THREE.LoopRepeat, Infinity);
	action.play();

	var morphAction = mesh.mixer.clipAction('walkMorph');
	if (morphAction) {
		morphAction.reset();
		morphAction.setLoop(THREE.LoopRepeat, Infinity);
		morphAction.play();
	}

	setWalkingWeight(mesh, 0);
	motionStatus.inStartWalking = true;
	motionStatus.inStopWalking = false;
	motionStatus.elapsedTimeSinceStartWalking = 0.0;
}

function setWalkingWeight(mesh, weight) {
	mesh.mixer.clipAction('walk').weight = weight;

	var morphAction = mesh.mixer.clipAction('walkMorph');
	if (morphAction) morphAction.weight = weight;
}

function stopWalking(mesh) {
	motionStatus.inStartWalking = false;
	motionStatus.inStopWalking = true;
	motionStatus.elapsedTimeSinceStopWalking = 0.0;
}

function resetAutonomousMovement() {
	autonomousMotionState = 'walking';
	autonomousDirection = Math.random() < 0.5 ? -1 : 1;
	autonomousTimeRemaining = 5 + Math.random() * 4;
}

function updateAutonomousMovement(delta, mesh) {
	var bounds = getCharacterMovementBounds(mesh);

	autonomousTimeRemaining -= delta;
	if (autonomousMotionState === 'walking') {
		var atLeftBorder = mesh.position.x <= bounds.minX + 0.01;
		var atRightBorder = mesh.position.x >= bounds.maxX - 0.01;

		if (atLeftBorder || atRightBorder || autonomousTimeRemaining <= 0) {
			autonomousMotionState = 'idle';
			autonomousTimeRemaining = 3 + Math.random() * 4;
		}
	} else if (
		autonomousTimeRemaining <= 0 &&
		!isIdleMotionPlannedOrPlaying() &&
		waveGraceRemaining <= 0
	) {
		autonomousMotionState = 'walking';
		autonomousTimeRemaining = 5 + Math.random() * 4;

		if (mesh.position.x <= bounds.minX + 1) {
			autonomousDirection = 1;
		} else if (mesh.position.x >= bounds.maxX - 1) {
			autonomousDirection = -1;
		} else {
			autonomousDirection *= -1;
		}
	}

	motionStatus.inMovingLeft =
		autonomousMotionState === 'walking' && autonomousDirection < 0;
	motionStatus.inMovingRight =
		autonomousMotionState === 'walking' && autonomousDirection > 0;
}

function startIdleMotion(mesh, name) {
	currentIdleMotionName = name;
	var actionName =
		name === 'sleeping-idle' && mesh.position.x < 0
			? 'sleeping-idle-mirrored'
			: name;
	currentIdleAction = mesh.mixer.clipAction(actionName);
	currentIdleAction.setLoop(THREE.LoopOnce, 1);
	currentIdleAction.clampWhenFinished = true;
	currentIdleAction.reset();
	currentIdleAction.weight = 0;
	var timeScale = name === 'wave' ? 0.5 : 1;
	if (currentIdleMotionName === 'sleeping-idle') {
		timeScale = Math.min(1, currentIdleAction._clip.duration / 10);
	}
	currentIdleAction.timeScale = timeScale;
	currentIdleAction.play();
	currentIdleAnimationEnded = false;

	if (currentIdleMotionName === 'sleeping-idle') {
		stopBlink(mesh);
		currentSleepingEyesAction = mesh.mixer.clipAction(
			'sleepingEyesClosedMorph',
		);
		currentSleepingEyesAction.setLoop(THREE.LoopRepeat, Infinity);
		currentSleepingEyesAction.reset();
		currentSleepingEyesAction.weight = 0;
		currentSleepingEyesAction.play();
	}

	currentIdleMorphAction = mesh.mixer.clipAction(name + 'Morph');
	if (currentIdleMorphAction) {
		currentIdleMorphAction.setLoop(THREE.LoopOnce, 1);
		currentIdleMorphAction.clampWhenFinished = true;
		currentIdleMorphAction.reset();
		currentIdleMorphAction.weight = 0;
		currentIdleMorphAction.timeScale = timeScale;
		currentIdleMorphAction.play();
	}
}

function stopIdleMotion(mesh) {
	if (currentIdleAction) currentIdleAction.stop();
	if (currentIdleMorphAction) currentIdleMorphAction.stop();
	if (currentSleepingEyesAction) {
		currentSleepingEyesAction.stop();
		currentSleepingEyesAction = null;
		startBlink(mesh);
	}
	currentIdleAction = null;
	currentIdleMorphAction = null;
	currentIdleMotionName = null;
	currentIdleAnimationEnded = false;
	idleTimeUntilNext = 2 + Math.random() * 3;
}

function setIdleMotionWeight(weight) {
	if (currentIdleAction) currentIdleAction.weight = weight;
	if (currentIdleMorphAction) currentIdleMorphAction.weight = weight;
	if (currentSleepingEyesAction) currentSleepingEyesAction.weight = weight;
}

function getIdleMotionFadeSpeed() {
	return currentIdleMotionName === 'sleeping-idle' ? 1 : 4;
}

function manageIdleMotion(delta, mesh) {
	var isFallIdle =
		currentIdleAction &&
		currentIdleAction._clip.name === 'fall-idle';
	var idleFadeSpeed = getIdleMotionFadeSpeed();

	if (pendingFallIdle && isJumpFalling) {
		if (currentIdleAction) {
			var fadeOutWeight = Math.max(
				0,
				currentIdleAction.weight - delta * idleFadeSpeed,
			);
			setIdleMotionWeight(fadeOutWeight);
			if (fadeOutWeight === 0) stopIdleMotion(mesh);
			return;
		}
		pendingFallIdle = false;
		startIdleMotion(mesh, 'fall-idle');
		return;
	}

	if (isFallIdle && !motionStatus.inJumping) {
		var landingWeight = Math.max(0, currentIdleAction.weight - delta * 8);
		setIdleMotionWeight(landingWeight);
		if (landingWeight === 0) stopIdleMotion(mesh);
		return;
	}

	var isBusy =
		!isFallIdle &&
		(dragRecoveryRemaining > 0 ||
			motionStatus.inMovingLeft ||
			motionStatus.inMovingRight ||
			motionStatus.inJumping ||
			motionStatus.inWalking ||
			motionStatus.inStartWalking ||
			motionStatus.inStopWalking);

	if (isBusy) {
		if (!idleWasInterrupted) {
			idleTimeUntilNext = 2 + Math.random() * 3;
			idleWasInterrupted = true;
		}

		if (currentIdleAction) {
			var fadeOutWeight = Math.max(
				0,
				currentIdleAction.weight - delta * idleFadeSpeed,
			);
			setIdleMotionWeight(fadeOutWeight);
			if (fadeOutWeight === 0) stopIdleMotion(mesh);
		}
		return;
	}

	idleWasInterrupted = false;

	if (!currentIdleAction) {
		if (pendingFallIdle) {
			pendingFallIdle = false;
			startIdleMotion(mesh, 'fall-idle');
			return;
		}

		idleTimeUntilNext -= delta;
		if (idleTimeUntilNext <= 0) {
			var name =
				idleMotionNames[Math.floor(Math.random() * idleMotionNames.length)];
			startIdleMotion(mesh, name);
		}
		return;
	}

	var animationEnded =
		currentIdleAction.time >= currentIdleAction._clip.duration;
	if (animationEnded && !currentIdleAnimationEnded) {
		currentIdleAnimationEnded = true;
		if (currentIdleMotionName === 'wave') {
			waveGraceRemaining = waveGraceDuration;
		}
	}

	var idleWeight = Math.min(
		1,
		currentIdleAction.weight + delta * idleFadeSpeed,
	);
	if (animationEnded) {
		idleWeight = Math.max(
			0,
			currentIdleAction.weight - delta * idleFadeSpeed,
		);
	}
	setIdleMotionWeight(idleWeight);
	if (idleWeight === 0) stopIdleMotion(mesh);
}

function manageStartupSequence(delta, mesh) {
	if (startupSequenceState === 'awaiting-render') {
		return true;
	}

	if (startupSequenceState === 'fade-in') {
		if (updateStartupFade(delta)) {
			startupSequenceState = 'wave';
			startIdleMotion(mesh, 'wave');
		}
		return true;
	}

	if (startupSequenceState === 'wave') {
		if (!currentIdleAction) {
			if (waveGraceRemaining <= 0) {
				startupSequenceState = 'complete';
				resetAutonomousMovement();
			}
		} else {
			manageIdleMotion(delta, mesh);
		}
		return true;
	}

	return false;
}

function manageMove(delta) {
	var mesh = helper.meshes[0];

	if (characterLifecycle === 'farewell-stopping') {
		fadeOutDragWalking(mesh, delta);
		if (mesh.mixer.clipAction('walk').weight === 0) {
			characterLifecycle = 'farewell-aligning';
		}
		return;
	}

	if (characterLifecycle === 'farewell-aligning') {
		rotateCharacterToNeutral(mesh, delta);
		if (rotationAngle === 0) {
			characterLifecycle = 'farewell';
			startIdleMotion(mesh, 'wave');
		}
		return;
	}

	if (characterLifecycle === 'farewell') {
		waveGraceRemaining = Math.max(0, waveGraceRemaining - delta);
		if (currentIdleAction) {
			manageIdleMotion(delta, mesh);
		} else if (waveGraceRemaining === 0) {
			beginCharacterFadeOut();
		}
		return;
	}

	if (characterLifecycle === 'fading') return;

	if (isCharacterDragging) {
		updateDraggedCharacter(mesh, delta);
		return;
	}

	if (isCharacterThrown) {
		updateThrownCharacter(mesh, delta);
		if (motionStatus.inJumping && isJumpFalling) {
			manageIdleMotion(delta, mesh);
		} else {
			fadeOutDragAnimations(mesh, delta);
		}
		return;
	}

	if (dragRecoveryRemaining > 0) {
		updateDragRecovery(mesh, delta);
		return;
	}

	waveGraceRemaining = Math.max(0, waveGraceRemaining - delta);
	if (manageStartupSequence(delta, mesh)) return;

	updateAutonomousMovement(delta, mesh);

	var movementDirection = 0;
	if (motionStatus.inMovingLeft && !motionStatus.inMovingRight) {
		movementDirection = -1;
	} else if (motionStatus.inMovingRight && !motionStatus.inMovingLeft) {
		movementDirection = 1;
	}

	var movementBounds = getCharacterMovementBounds(mesh);
	var availableWidth = movementBounds.maxX - movementBounds.minX;
	var movementSpeed = Math.min(characterMovementSpeed, availableWidth / 2.5);
	var nextX =
		mesh.position.x + movementDirection * movementSpeed * delta;
	var boundedX = Math.max(
		movementBounds.minX,
		Math.min(movementBounds.maxX, nextX),
	);
	var isMoving = movementDirection !== 0 && boundedX !== mesh.position.x;
	mesh.position.x = boundedX;
	var isWalking = isMoving;

	var screenPosition =
		movementBounds.maxX > 0
			? Math.max(-1, Math.min(1, mesh.position.x / movementBounds.maxX))
			: 0;
	var targetRotation = -screenPosition * (Math.PI / 12);
	if (isMoving && movementDirection < 0) {
		targetRotation = -Math.PI / 2;
	} else if (isMoving && movementDirection > 0) {
		targetRotation = Math.PI / 2;
	}
	var rotationStep = 3 * delta;
	var rotationDifference = targetRotation - rotationAngle;
	if (Math.abs(rotationDifference) <= rotationStep) {
		rotationAngle = targetRotation;
	} else {
		rotationAngle += rotationDifference < 0 ? -rotationStep : rotationStep;
	}

	mesh.rotation.order = 'XYZ';
	mesh.rotation.set(0, rotationAngle, 0);

	updateJumpMotion(mesh, delta);

	if (motionStatus.inStartWalking) {
		motionStatus.elapsedTimeSinceStartWalking += delta;
		var action = mesh.mixer.clipAction('walk');
		var weight = Math.min(1.0, action.weight + delta * 4);
		setWalkingWeight(mesh, weight);

		if (weight === 1.0) {
			motionStatus.inStartWalking = false;
		}
	}

	if (motionStatus.inStopWalking) {
		motionStatus.elapsedTimeSinceStopWalking += delta;
		var action = mesh.mixer.clipAction('walk');
		var weight = Math.max(0.0, action.weight - delta * 4);
		setWalkingWeight(mesh, weight);

		if (weight === 0.0) {
			motionStatus.inStopWalking = false;
			stopMotion(mesh, 'walk');
		}
	}

	if (!motionStatus.inWalking && isWalking) {
		startWalking(mesh);
	}

	if (motionStatus.inWalking && !isWalking) {
		stopWalking(mesh);
	}

	motionStatus.inWalking = isWalking;
	manageIdleMotion(delta, mesh);
}

function fadeOutDragAnimations(mesh, delta) {
	fadeOutDragWalking(mesh, delta);
	fadeOutDragIdle(mesh, delta);
}

function fadeOutDragWalking(mesh, delta) {
	var walkWeight = Math.max(0, mesh.mixer.clipAction('walk').weight - delta * 4);
	setWalkingWeight(mesh, walkWeight);
	if (walkWeight === 0) stopMotion(mesh, 'walk');
}

function fadeOutDragIdle(mesh, delta) {
	if (currentIdleAction) {
		var idleWeight = Math.max(
			0,
			currentIdleAction.weight - delta * getIdleMotionFadeSpeed(),
		);
		setIdleMotionWeight(idleWeight);
		if (idleWeight === 0) stopIdleMotion(mesh);
	}
}

function rotateCharacterToNeutral(mesh, delta) {
	var rotationStep = 3 * delta;
	var rotationDifference = -rotationAngle;
	if (Math.abs(rotationDifference) <= rotationStep) {
		rotationAngle = 0;
	} else {
		rotationAngle += rotationDifference < 0 ? -rotationStep : rotationStep;
	}
	mesh.rotation.order = 'XYZ';
	mesh.rotation.set(0, rotationAngle, 0);
}

function updateJumpMotion(mesh, delta) {
	if (!motionStatus.inJumping) return;

	mesh.position.y += motionStatus.jumpVelocity * delta;
	motionStatus.jumpVelocity -= gravity * delta;

	if (!isJumpFalling && motionStatus.jumpVelocity <= 0) {
		isJumpFalling = true;
		pendingFallIdle = true;
	}

	if (mesh.position.y <= groundY) {
		mesh.position.y = groundY;
		motionStatus.jumpVelocity = 0;
		motionStatus.inJumping = false;
		isJumpFalling = false;
		pendingFallIdle = false;
	}
}

function isIdleMotionPlannedOrPlaying() {
	return (
		(currentIdleMotionName &&
			idleMotionNames.indexOf(currentIdleMotionName) !== -1) ||
		(idleTimeUntilNext <= 0 && idleMotionNames.length > 0)
	);
}

function getCharacterMovementBounds(mesh) {
	var viewDepth = Math.max(0, camera.position.z - mesh.position.z);
	var halfViewWidth =
		viewDepth * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
	var maxX = Math.max(
		0,
		halfViewWidth -
			characterHalfWidth * characterScale -
			characterViewportMargin,
	);

	return { minX: -maxX, maxX: maxX };
}
