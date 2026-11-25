function init(onReady) {
	container = document.getElementById('character-widget');
	var isEmbeddedCharacter = container !== null;
	if (!container) {
		container = document.createElement('div');
		container.id = 'character-widget';
		container.style.position = 'fixed';
		container.style.top = '0';
		container.style.right = '0';
		container.style.bottom = '0';
		container.style.left = '0';
		container.style.pointerEvents = 'none';
		document.body.appendChild(container);
	}

	var viewportWidth = container.clientWidth || window.innerWidth;
	var viewportHeight = container.clientHeight || window.innerHeight;

	camera = new THREE.PerspectiveCamera(
		45,
		viewportWidth / viewportHeight,
		1,
		2000,
	);
	controls = new THREE.OrbitControls(camera);
	controls.enableKeys = false;
	controls.enabled = !characterOnlyMode;

	scene = new THREE.Scene();

	var ambient = new THREE.AmbientLight(0x666666);
	scene.add(ambient);

	var directionalLight = new THREE.DirectionalLight(0x887766);
	directionalLight.position.set(-1, 1, 1).normalize();
	scene.add(directionalLight);

	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(viewportWidth, viewportHeight);
	renderer.setClearColor(new THREE.Color(0xffffff), 0);
	renderer.domElement.style.display = 'block';
	renderer.domElement.style.pointerEvents = 'none';
	container.appendChild(renderer.domElement);

	effect = new THREE.OutlineEffect(renderer);

	camera.lookAt(scene.position, container);
	resetPosition();

	helper = new THREE.MMDHelper();
	loader = new THREE.MMDLoader();

	loadModels(function () {
		var mesh = helper.meshes[0];
		teto = mesh;

		loadVpds(mesh, function () {
			adjustIdleVpdArms(poses['basic']);
			helper.poseAsVpd(mesh, poses['basic']);
			// Align rigid bodies with the basic pose before physics starts stepping.
			mesh.physics.reset();

			loadVmds(mesh, function () {
				loader.pourVmdIntoModel(mesh, blinkVmd, 'blink');
				loader.pourVmdIntoModel(
					mesh,
					sleepingEyesClosedVmd,
					'sleepingEyesClosed',
				);

				helper.setAnimation(mesh);

				for (var i = 0; i < motionParams.length; i++) {
					var param = motionParams[i];

					var name = param.name;
					mesh.mixer.clipAction(name).weight = 0.0;
					var morphAction = mesh.mixer.clipAction(name + 'Morph');
					if (morphAction) morphAction.weight = 0.0;
					if (!characterOnlyMode) {
						startMotion(mesh, name);
					}
				}

				if (characterOnlyMode) {
					var walkAction = mesh.mixer.clipAction('walk');
					walkAction.setLoop(THREE.LoopRepeat, Infinity);
					walkAction.weight = 0.0;

					var walkMorphAction = mesh.mixer.clipAction('walkMorph');
					if (walkMorphAction) {
						walkMorphAction.setLoop(THREE.LoopRepeat, Infinity);
						walkMorphAction.weight = 0.0;
					}
				}

				createDictionary(mesh);
				if (isEmbeddedCharacter) initializeCharacterDragging(mesh);
				startBlink(mesh);

				initializeStartupFade();
				mesh.visible = true;
				ready = true;
				container.style.visibility = 'visible';
				container.setAttribute('aria-hidden', 'false');
				if (onReady) onReady();
			});
		});
	});

	window.addEventListener('resize', onWindowResize, false);
}

function adjustIdleVpdArms(pose) {
	var forwardRotation = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3(1, 0, 0),
		-0.18,
	);

	for (var i = 0; i < pose.bones.length; i++) {
		var bone = pose.bones[i];
		if (bone.name !== '左腕' && bone.name !== '右腕') continue;

		var rotation = new THREE.Quaternion(
			bone.quaternion[0],
			bone.quaternion[1],
			bone.quaternion[2],
			bone.quaternion[3],
		);
		rotation.multiply(forwardRotation).normalize();
		bone.quaternion = [rotation.x, rotation.y, rotation.z, rotation.w];
	}
}

function loadModels(callback) {
	function load(index) {
		if (index >= modelParams.length) {
			callback();
			return;
		}

		var param = modelParams[index];

		loader.loadModel(
			param.file,
			function (object) {
				var mesh = object;

				updateCharacterBounds(mesh);
				helper.add(mesh);
				helper.setPhysics(mesh);
				resetPosition();

				world = mesh.physics.world;

				mesh.visible = false;

				scene.add(mesh);

				load(index + 1);
			},
			onProgress,
			onError,
		);
	}

	load(0);
}

function loadVmds(mesh, callback) {
	function load(index) {
		if (index >= motionParams.length) {
			callback();
			return;
		}

		var param = motionParams[index];

		loader.loadVmds(
			param.files,
			function (vmd) {
				loader.pourVmdIntoModel(mesh, vmd, param.name);
				if (param.name === 'sleeping-idle') {
					loader.pourVmdIntoModel(
						mesh,
						mirrorVmd(vmd),
						param.name + '-mirrored',
					);
				}

				load(index + 1);
			},
			onProgress,
			onError,
		);
	}

	load(0);
}

function mirrorVmd(vmd) {
	function mirrorSideName(name) {
		return name.replace(/[左右]/g, function (side) {
			return side === '左' ? '右' : '左';
		});
	}

	var mirrored = Object.assign({}, vmd);
	mirrored.motions = vmd.motions.map(function (motion) {
		var position = motion.position.slice();
		position[0] = -position[0];

		var rotation = motion.rotation.slice();
		rotation[1] = -rotation[1];
		rotation[2] = -rotation[2];

		return Object.assign({}, motion, {
			boneName: mirrorSideName(motion.boneName),
			position: position,
			rotation: rotation,
		});
	});
	mirrored.morphs = vmd.morphs.map(function (morph) {
		return Object.assign({}, morph, {
			morphName: mirrorSideName(morph.morphName),
		});
	});
	return mirrored;
}

function loadVpds(mesh, callback) {
	function load(index) {
		if (index >= poseParams.length) {
			callback();
			return;
		}

		var param = poseParams[index];

		loader.loadVpd(
			param.file,
			function (vpd) {
				poses[param.name] = vpd;

				load(index + 1);
			},
			onProgress,
			onError,
		);
	}
	load(0);
}

function createDictionary(mesh) {
	var bones = mesh.skeleton.bones;

	for (var i = 0; i < bones.length; i++) {
		var b = bones[i];
		boneDictionary[b.name] = i;
	}

	for (var i = 0; i < motionParams.length; i++) {
		var p = motionParams[i];
		motionDictionary[p.name] = i;
	}
}

function updateCharacterBounds(mesh) {
	mesh.updateMatrixWorld(true);
	var bounds = new THREE.Box3().setFromObject(mesh);
	if (bounds.isEmpty()) {
		throw new Error('Could not calculate character bounds for movement.');
	}

	characterHalfWidth = Math.max(
		Math.abs(bounds.min.x - mesh.position.x),
		Math.abs(bounds.max.x - mesh.position.x),
		Math.abs(bounds.min.z - mesh.position.z),
		Math.abs(bounds.max.z - mesh.position.z),
	);
	characterLocalMinY = bounds.min.y - mesh.position.y;
	characterLocalMaxY = bounds.max.y - mesh.position.y;

	characterScale = 1;
	mesh.scale.set(characterScale, characterScale, characterScale);
	mesh.updateMatrixWorld(true);
	updateCameraFraming();
}

function getViewportCharacterScale() {
	var minimumAspect = 0.45;
	var fullSizeAspect = 1.1;
	var responsiveAspect = Math.max(
		0,
		Math.min(
			1,
			(camera.aspect - minimumAspect) / (fullSizeAspect - minimumAspect),
		),
	);

	return characterMinimumScale + (1 - characterMinimumScale) * responsiveAspect;
}

function updateCameraFraming() {
	var requiredHalfWidth =
		characterHalfWidth * characterScale +
		characterViewportMargin +
		characterMinimumMovementRange;
	var minimumDistanceForMovement =
		requiredHalfWidth /
		(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
	var distanceForResponsiveSize =
		(cameraParams[0].position.z * characterScale) /
		getViewportCharacterScale();
	camera.position.z = Math.max(
		minimumDistanceForMovement,
		distanceForResponsiveSize,
	);
	camera.updateProjectionMatrix();
}

function onWindowResize() {
	var viewportWidth = container.clientWidth || window.innerWidth;
	var viewportHeight = container.clientHeight || window.innerHeight;
	windowHalfX = viewportWidth / 2;
	windowHalfY = viewportHeight / 2;

	camera.aspect = viewportWidth / viewportHeight;
	updateCameraFraming();

	effect.setSize(viewportWidth, viewportHeight);
}

function unloadCharacter() {
	ready = false;
	animationLoopStarted = false;
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	clock.stop();
	window.removeEventListener('resize', onWindowResize, false);
	disposeCharacterDragging();

	if (controls && controls.dispose) controls.dispose();

	var meshes = helper ? helper.meshes.slice() : [];
	for (var i = 0; i < meshes.length; i++) {
		var mesh = meshes[i];
		if (mesh.mixer) mesh.mixer.stopAllAction();
		disposeCharacterPhysics(mesh);
		if (scene) scene.remove(mesh);
		disposeCharacterModel(mesh);
	}

	if (renderer) {
		var context = renderer.getContext && renderer.getContext();
		var loseContext = context && context.getExtension('WEBGL_lose_context');
		if (loseContext) loseContext.loseContext();
		if (renderer.domElement.parentNode) {
			renderer.domElement.parentNode.removeChild(renderer.domElement);
		}
	}

	if (container) {
		container.classList.remove('is-fading-out');
		container.style.visibility = 'hidden';
		container.setAttribute('aria-hidden', 'true');
	}

	camera = null;
	scene = null;
	renderer = null;
	effect = null;
	helper = null;
	loader = null;
	controls = null;
	teto = null;
	world = null;
	poses = {};
	boneDictionary = {};
	modelDictionary = {};
	motionDictionary = {};
	characterHalfWidth = 0;
	characterLocalMinY = 0;
	characterLocalMaxY = 0;
	characterScale = 1;
	startupSequenceState = 'awaiting-render';
	startupFadeElapsed = 0;
	waveGraceRemaining = 0;
	currentIdleAction = null;
	currentIdleMorphAction = null;
	currentSleepingEyesAction = null;
	currentIdleMotionName = null;
	currentIdleAnimationEnded = false;
	rotationAngle = 0;
}

function disposeCharacterPhysics(mesh) {
	var physics = mesh.physics;
	if (!physics) return;

	var physicsWorld = physics.world;
	for (var i = 0; i < physics.constraints.length; i++) {
		var constraint = physics.constraints[i].constraint;
		if (physicsWorld && constraint) physicsWorld.removeConstraint(constraint);
		if (constraint) Ammo.destroy(constraint);
	}

	for (var i = 0; i < physics.bodies.length; i++) {
		var rigidBody = physics.bodies[i];
		if (physicsWorld && rigidBody.body) {
			physicsWorld.removeRigidBody(rigidBody.body);
		}
		if (rigidBody.body) {
			var body = rigidBody.body;
			var motionState = body.getMotionState();
			var shape = body.getCollisionShape();
			Ammo.destroy(body);
			Ammo.destroy(motionState);
			Ammo.destroy(shape);
		}
		if (rigidBody.boneOffsetForm) Ammo.destroy(rigidBody.boneOffsetForm);
		if (rigidBody.boneOffsetFormInverse) {
			Ammo.destroy(rigidBody.boneOffsetFormInverse);
		}
	}

	var dispatcher =
		physicsWorld && physicsWorld.getDispatcher
			? physicsWorld.getDispatcher()
			: null;
	var broadphase =
		physicsWorld && physicsWorld.getBroadphase
			? physicsWorld.getBroadphase()
			: null;
	if (physicsWorld) Ammo.destroy(physicsWorld);
	if (dispatcher) Ammo.destroy(dispatcher);
	if (broadphase) Ammo.destroy(broadphase);

	physics.constraints.length = 0;
	physics.bodies.length = 0;
	mesh.physics = null;
}

function disposeCharacterModel(mesh) {
	var disposedTextures = [];

	mesh.traverse(function (object) {
		if (object.geometry && object.geometry.dispose) {
			object.geometry.dispose();
		}

		var materials = Array.isArray(object.material)
			? object.material
			: [object.material];
		for (var i = 0; i < materials.length; i++) {
			var material = materials[i];
			if (!material) continue;

			for (var key in material) {
				var value = material[key];
				if (
					value instanceof THREE.Texture &&
					disposedTextures.indexOf(value) === -1
				) {
					value.dispose();
					disposedTextures.push(value);
				}
			}

			material.dispose();
		}
	});
}
