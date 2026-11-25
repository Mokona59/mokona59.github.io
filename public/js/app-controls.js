function resetPosition() {
	startupSequenceState = 'awaiting-render';
	startupFadeElapsed = 0;
	waveGraceRemaining = 0;
	isCharacterDragging = false;
	isCharacterThrown = false;
	dragRecoveryRemaining = 0;
	dragPointerId = null;
	dragVelocity.set(0, 0, 0);

	if (camera) {
		camera.position.copy(cameraParams[0].position);
		camera.up.set(0, 1, 0);
		camera.rotation.set(0, 0, 0);
		updateCameraFraming();
		controls.update();
	}

	if (helper && helper.meshes.length > 0) {
		var mesh = helper.meshes[0];
		mesh.position.copy(modelParams[0].position);
		rotationAngle = 0;
		mesh.rotation.order = 'XYZ';
		mesh.rotation.set(0, 0, 0);

		motionStatus.inMovingLeft = false;
		motionStatus.inMovingRight = false;
		motionStatus.inJumping = false;
		motionStatus.jumpVelocity = 0;
		motionStatus.inWalking = false;
		motionStatus.inStartWalking = false;
		motionStatus.inStopWalking = false;
		pendingFallIdle = false;
		isJumpFalling = false;
		dragWasFalling = false;
		dragFallVelocity = 0;
		resetAutonomousMovement();

		if (mesh.physics) {
			mesh.updateMatrixWorld(true);
			mesh.physics.reset();
		}
	}
}

var characterDragListeners = null;

function initializeCharacterDragging(mesh) {
	disposeCharacterDragging();
	var pendingTouchDrag = null;
	var touchHoldTimer = null;
	var characterPointerId = null;

	function cancelPendingTouchDrag() {
		if (touchHoldTimer !== null) {
			window.clearTimeout(touchHoldTimer);
			touchHoldTimer = null;
		}
		pendingTouchDrag = null;
	}

	function clearCharacterPointer() {
		if (characterPointerId === null) return;

		characterPointerId = null;
		document.documentElement.classList.remove('character-interaction-active');
	}

	function startDrag(event, pointerWorld) {
		dragWasFalling = motionStatus.inJumping && isJumpFalling;
		dragFallVelocity = dragWasFalling ? motionStatus.jumpVelocity : 0;
		dragPointerWorld.copy(pointerWorld);
		dragPreviousPointerWorld.copy(pointerWorld);
		dragOffset.copy(mesh.position).sub(pointerWorld);
		dragVelocity.set(0, 0, 0);
		dragLastPointerTime = performance.now();
		dragPointerId = event.pointerId;
		dragRecoveryRemaining = 0;
		isCharacterDragging = true;
		autonomousMotionState = 'idle';
		autonomousTimeRemaining = 0;
		waveGraceRemaining = 0;
		idleWasInterrupted = false;

		pendingFallIdle = false;
		isJumpFalling = false;
		motionStatus.inWalking = false;
		motionStatus.inStartWalking = false;
		motionStatus.inStopWalking = false;
		motionStatus.inMovingLeft = false;
		motionStatus.inMovingRight = false;
		motionStatus.inJumping = false;
		motionStatus.jumpVelocity = 0;
	}

	var onPointerDown = function (event) {
		if (event.target.closest && event.target.closest('.navbar')) return;

		if (event.button !== 0) return;
		if (characterPointerId !== null) return;

		var raycaster = getDragPointerRay(event);
		if (!raycaster || raycaster.intersectObject(mesh, true).length === 0) return;
		event.preventDefault();
		event.stopPropagation();
		characterPointerId = event.pointerId;
		document.documentElement.classList.add('character-interaction-active');
		var pointerWorld = getDragPointerWorld(raycaster, mesh);

		if (event.pointerType === 'touch') {
			if (
				!ready ||
				characterLifecycle !== 'active' ||
				startupSequenceState !== 'complete' ||
				isCharacterDragging ||
				isCharacterThrown ||
				dragRecoveryRemaining > 0
			) {
				return;
			}

			if (!pointerWorld) return;
			pendingTouchDrag = {
				pointerId: event.pointerId,
				clientX: event.clientX,
				clientY: event.clientY,
			};
			touchHoldTimer = window.setTimeout(function () {
				if (!pendingTouchDrag) return;

				var pendingEvent = pendingTouchDrag;
				var pendingRaycaster = getDragPointerRay(pendingEvent);
				var pendingPointerWorld =
					pendingRaycaster && getDragPointerWorld(pendingRaycaster, mesh);
				cancelPendingTouchDrag();
				if (pendingPointerWorld) {
					startDrag(pendingEvent, pendingPointerWorld);
				}
			}, 1000);
			return;
		}

		if (
			!ready ||
			characterLifecycle !== 'active' ||
			startupSequenceState !== 'complete' ||
			isCharacterDragging ||
			isCharacterThrown ||
			dragRecoveryRemaining > 0
		) {
			return;
		}

		if (!pointerWorld) return;
		startDrag(event, pointerWorld);
	};

	var onPointerMove = function (event) {
		if (pendingTouchDrag && event.pointerId === pendingTouchDrag.pointerId) {
			var deltaX = event.clientX - pendingTouchDrag.clientX;
			var deltaY = event.clientY - pendingTouchDrag.clientY;
			if (Math.hypot(deltaX, deltaY) > 10) cancelPendingTouchDrag();
			return;
		}

		if (!isCharacterDragging || event.pointerId !== dragPointerId) return;

		var raycaster = getDragPointerRay(event);
		if (!raycaster) return;
		var pointerWorld = getDragPointerWorld(raycaster, mesh);
		if (!pointerWorld) return;

		event.preventDefault();
		event.stopPropagation();
		var now = performance.now();
		var elapsed = Math.max(0.001, (now - dragLastPointerTime) / 1000);
		dragVelocity
			.copy(pointerWorld)
			.sub(dragPreviousPointerWorld)
			.multiplyScalar(1 / elapsed);
		if (dragVelocity.length() > 18) dragVelocity.setLength(18);
		dragPointerWorld.copy(pointerWorld);
		dragPreviousPointerWorld.copy(pointerWorld);
		dragLastPointerTime = now;
	};

	var onTouchMove = function (event) {
		if (isCharacterDragging && event.cancelable) event.preventDefault();
	};

	var onSelectStart = function (event) {
		if (characterPointerId !== null) event.preventDefault();
	};

	var onContextMenu = function (event) {
		if (characterPointerId !== null) event.preventDefault();
	};

	var onClick = function (event) {
		if (event.target.closest && event.target.closest('.navbar')) return;

		var raycaster = getDragPointerRay(event);
		if (!raycaster || raycaster.intersectObject(mesh, true).length === 0) return;

		event.preventDefault();
		event.stopPropagation();
	};

	function finishDrag(event) {
		if (
			pendingTouchDrag &&
			(!event || event.pointerId === pendingTouchDrag.pointerId)
		) {
			cancelPendingTouchDrag();
		}
		if (
			characterPointerId !== null &&
			(!event || event.pointerId === characterPointerId)
		) {
			if (event) {
				event.preventDefault();
				event.stopPropagation();
			}
			clearCharacterPointer();
		}
		if (!isCharacterDragging || (event && event.pointerId !== dragPointerId)) return;
		if (event && !event.defaultPrevented) {
			event.preventDefault();
			event.stopPropagation();
		}

		isCharacterDragging = false;
		dragPointerId = null;
		isCharacterThrown = dragVelocity.length() > 0.6;
		var shouldResumeFalling =
			dragWasFalling || dragVelocity.y < -0.6;
		var fallVelocity = dragWasFalling
			? dragFallVelocity
			: dragVelocity.y;
		if (shouldResumeFalling && mesh.position.y > groundY) {
			motionStatus.inJumping = true;
			motionStatus.jumpVelocity = Math.min(0, fallVelocity);
			isJumpFalling = true;
			pendingFallIdle = true;
		}
		dragWasFalling = false;
		dragFallVelocity = 0;
		if (!isCharacterThrown) {
			dragVelocity.set(0, 0, 0);
			dragRecoveryRemaining = 0.75;
		}
	}

	var onWindowBlur = function () {
		finishDrag();
	};

	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('pointermove', onPointerMove, true);
	document.addEventListener('touchmove', onTouchMove, {
		capture: true,
		passive: false,
	});
	document.addEventListener('selectstart', onSelectStart, true);
	document.addEventListener('contextmenu', onContextMenu, true);
	document.addEventListener('click', onClick, true);
	document.addEventListener('pointerup', finishDrag, true);
	document.addEventListener('pointercancel', finishDrag, true);
	window.addEventListener('blur', onWindowBlur);

	characterDragListeners = {
		pointerdown: onPointerDown,
		pointermove: onPointerMove,
		touchmove: onTouchMove,
		selectstart: onSelectStart,
		contextmenu: onContextMenu,
		click: onClick,
		finishDrag: finishDrag,
		windowBlur: onWindowBlur,
		cancelPendingTouchDrag: cancelPendingTouchDrag,
		clearCharacterPointer: clearCharacterPointer,
	};
}

function disposeCharacterDragging() {
	if (!characterDragListeners) return;

	characterDragListeners.cancelPendingTouchDrag();
	characterDragListeners.clearCharacterPointer();
	document.removeEventListener(
		'pointerdown',
		characterDragListeners.pointerdown,
		true,
	);
	document.removeEventListener(
		'pointermove',
		characterDragListeners.pointermove,
		true,
	);
	document.removeEventListener(
		'touchmove',
		characterDragListeners.touchmove,
		true,
	);
	document.removeEventListener(
		'selectstart',
		characterDragListeners.selectstart,
		true,
	);
	document.removeEventListener(
		'contextmenu',
		characterDragListeners.contextmenu,
		true,
	);
	document.removeEventListener(
		'click',
		characterDragListeners.click,
		true,
	);
	document.removeEventListener(
		'pointerup',
		characterDragListeners.finishDrag,
		true,
	);
	document.removeEventListener(
		'pointercancel',
		characterDragListeners.finishDrag,
		true,
	);
	window.removeEventListener('blur', characterDragListeners.windowBlur);

	characterDragListeners = null;
	isCharacterDragging = false;
	isCharacterThrown = false;
	dragRecoveryRemaining = 0;
	dragPointerId = null;
	dragVelocity.set(0, 0, 0);
}

function getDragPointerRay(event) {
	var bounds = renderer.domElement.getBoundingClientRect();
	if (bounds.width === 0 || bounds.height === 0) return null;

	var pointer = new THREE.Vector2(
		((event.clientX - bounds.left) / bounds.width) * 2 - 1,
		-((event.clientY - bounds.top) / bounds.height) * 2 + 1,
	);
	var raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(pointer, camera);
	return raycaster;
}

function getDragPointerWorld(raycaster, mesh) {
	var plane = new THREE.Plane(
		new THREE.Vector3(0, 0, 1),
		-mesh.position.z,
	);
	var point = new THREE.Vector3();
	return raycaster.ray.intersectPlane(plane, point) ? point : null;
}

function updateDraggedCharacter(mesh, delta) {
	var desiredPosition = dragPointerWorld.clone().add(dragOffset);
	var horizontalBounds = getCharacterMovementBounds(mesh);
	var verticalBounds = getCharacterVerticalBounds(mesh);
	desiredPosition.x = Math.max(
		horizontalBounds.minX,
		Math.min(horizontalBounds.maxX, desiredPosition.x),
	);
	desiredPosition.y = Math.max(
		verticalBounds.minY,
		Math.min(verticalBounds.maxY, desiredPosition.y),
	);
	desiredPosition.z = mesh.position.z;

	var movement = desiredPosition.clone().sub(mesh.position);
	mesh.position.copy(desiredPosition);
	mesh.updateMatrixWorld(true);
	translatePhysicsBodies(mesh.physics, movement);
	fadeOutDragAnimations(mesh, delta);
	rotateCharacterToNeutral(mesh, delta);
}

function updateThrownCharacter(mesh, delta) {
	dragVelocity.y -= gravity * delta;
	var desiredPosition = mesh.position
		.clone()
		.addScaledVector(dragVelocity, delta);
	var horizontalBounds = getCharacterMovementBounds(mesh);
	var verticalBounds = getCharacterVerticalBounds(mesh);
	var minimumY = Math.max(groundY, verticalBounds.minY);
	var hitVerticalFloor = false;
	var hitGround = false;

	if (desiredPosition.x < horizontalBounds.minX) {
		desiredPosition.x = horizontalBounds.minX;
		dragVelocity.x = Math.abs(dragVelocity.x) * 0.25;
	} else if (desiredPosition.x > horizontalBounds.maxX) {
		desiredPosition.x = horizontalBounds.maxX;
		dragVelocity.x = -Math.abs(dragVelocity.x) * 0.25;
	}
	if (desiredPosition.y < minimumY) {
		hitVerticalFloor = true;
		hitGround = minimumY === groundY;
		desiredPosition.y = minimumY;
		dragVelocity.y =
			Math.abs(dragVelocity.y) > 2 ? Math.abs(dragVelocity.y) * 0.2 : 0;
		if (hitGround) {
			desiredPosition.x = mesh.position.x;
			dragVelocity.set(0, 0, 0);
		}
	} else if (desiredPosition.y > verticalBounds.maxY) {
		desiredPosition.y = verticalBounds.maxY;
		dragVelocity.y = -Math.abs(dragVelocity.y) * 0.2;
	}
	desiredPosition.z = mesh.position.z;

	var movement = desiredPosition.clone().sub(mesh.position);
	mesh.position.copy(desiredPosition);
	mesh.updateMatrixWorld(true);
	translatePhysicsBodies(mesh.physics, movement);
	dragVelocity.multiplyScalar(Math.exp(-1.6 * delta));
	rotateCharacterToNeutral(mesh, delta);

	if (hitVerticalFloor) {
		isJumpFalling = false;
		pendingFallIdle = false;
		motionStatus.inJumping = false;
		if (hitGround) {
			rotationAngle = 0;
			mesh.rotation.set(0, 0, 0);
		}
	} else if (
		!isJumpFalling &&
		dragVelocity.y <= 0 &&
		mesh.position.y > groundY
	) {
		motionStatus.inJumping = true;
		motionStatus.jumpVelocity = dragVelocity.y;
		isJumpFalling = true;
		pendingFallIdle = true;
	}

	if (dragVelocity.length() < 0.7) {
		isCharacterThrown = false;
		if (motionStatus.inJumping && isJumpFalling) {
			motionStatus.jumpVelocity = Math.min(
				motionStatus.jumpVelocity,
				dragVelocity.y,
			);
		}
		dragRecoveryRemaining = 0.75;
	}
}

function updateDragRecovery(mesh, delta) {
	rotateCharacterToNeutral(mesh, delta);
	updateJumpMotion(mesh, delta);
	manageIdleMotion(delta, mesh);
	dragRecoveryRemaining = Math.max(0, dragRecoveryRemaining - delta);
	if (dragRecoveryRemaining === 0) resetAutonomousMovement();
}

function getCharacterVerticalBounds(mesh) {
	var viewDepth = Math.max(0, camera.position.z - mesh.position.z);
	var halfViewHeight = viewDepth * Math.tan((camera.fov * Math.PI) / 360);
	var minimumY =
		-halfViewHeight + characterViewportMargin - characterLocalMinY * characterScale;
	var maximumY =
		halfViewHeight - characterViewportMargin - characterLocalMaxY * characterScale;
	if (minimumY > maximumY) {
		var centerY = (minimumY + maximumY) / 2;
		return { minY: centerY, maxY: centerY };
	}
	return { minY: minimumY, maxY: maximumY };
}

function translatePhysicsBodies(physics, movement) {
	if (!physics || movement.lengthSq() === 0) return;

	for (var i = 0; i < physics.bodies.length; i++) {
		var rigidBody = physics.bodies[i];
		var transform = rigidBody.body.getWorldTransform();
		var origin = transform.getOrigin();
		origin.setValue(
			origin.x() + movement.x,
			origin.y() + movement.y,
			origin.z() + movement.z,
		);
		rigidBody.body.setCenterOfMassTransform(transform);
		rigidBody.body.getMotionState().setWorldTransform(transform);
		if (rigidBody.params.type !== 0) rigidBody.body.activate(true);
		if (physics.world.updateSingleAabb) {
			physics.world.updateSingleAabb(rigidBody.body);
		}
	}
}

function letObjectVisible(obj) {
	obj.visible = true;
}

function letObjectInvisible(obj) {
	if (!debug) {
		obj.visible = false;
	}
}
