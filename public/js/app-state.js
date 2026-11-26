var container;
var camera, scene, renderer, effect;
var helper, loader;
var controls;
var teto;
var world;
var ready = false;
var characterOnlyMode = true;
var characterLifecycle = 'hidden';
var characterHalfWidth = 0;
var characterLocalMinY = 0;
var characterLocalMaxY = 0;
var characterScale = 1;
var characterMovementSpeed = 8;
var characterViewportMargin = 1.5;
var characterMinimumMovementRange = 4;
var characterMinimumScale = 0.65;
var autonomousMotionState = 'walking';
var autonomousDirection = 1;
var autonomousTimeRemaining = 4;
var startupSequenceState = 'awaiting-render';
var startupFadeDuration = 1;
var startupFadeElapsed = 0;
var waveGraceDuration = 0.5;
var waveGraceRemaining = 0;
var maximumFrameDelta = 1 / 30;
var mouseX = 0,
	mouseY = 0;
var windowHalfX = window.innerWidth / 2;
var windowHalfY = window.innerHeight / 2;
var clock = new THREE.Clock();
var boneDictionary = {};
var modelDictionary = {};
var motionDictionary = {};
var motionStatus = {
	inWalking: false,
	inStartWalking: false,
	inStopWalking: false,
	inMovingLeft: false,
	inMovingRight: false,
	inJumping: false,
	jumpVelocity: 0,
	duration: 0.0,
	elapsedTimeSinceStartWalking: 0.0,
	elapsedTimeSinceStopWalking: 0.0,
};

var rotationAngle = 0;
var idleMotionNames = ['wave', 'sleeping-idle'];
var currentIdleMotionName = null;
var currentIdleAction = null;
var currentIdleMorphAction = null;
var currentSleepingEyesAction = null;
var currentIdleAnimationEnded = false;
var idleTimeUntilNext = 2 + Math.random() * 3;
var idleWasInterrupted = false;
var pendingFallIdle = false;
var isJumpFalling = false;
var dragWasFalling = false;
var dragFallVelocity = 0;
var isCharacterDragging = false;
var isCharacterThrown = false;
var dragRecoveryRemaining = 0;
var dragPointerId = null;
var dragPointerWorld = new THREE.Vector3();
var dragOffset = new THREE.Vector3();
var dragVelocity = new THREE.Vector3();
var dragPreviousPointerWorld = new THREE.Vector3();
var dragLastPointerTime = 0;

// see the license https://github.com/takahirox/MMDLoader-app#readme for these assets

var modelParams = [
	{
		name: 'teto',
		file: '/public/Teto/Kasane_Teto_SV_TEX.pmx',
		position: new THREE.Vector3(0, -15, 0),
	},
];

var cameraParams = [
	{
		name: 'camera',
		position: new THREE.Vector3(0, 0, 45),
	},
];

var gravity = 40;
var jumpPower = 18;
var groundY = modelParams[0].position.y;

var blinkMorphName = 'まばたき';

var poseParams = [
	{
		name: 'basic',
		file: '/public/animations/makoto_basic.vpd',
	},
];

var poses = {};

var motionParams = [
	{
		name: 'walk',
		isMoving: true,
		files: ['/public/animations/walk.vmd'],
	},
	{
		name: 'wave',
		isMoving: false,
		files: ['/public/animations/wave.vmd'],
	},
	{
		name: 'sleeping-idle',
		isMoving: false,
		files: ['/public/animations/sleeping-idle.vmd'],
	},
	{
		name: 'fall-idle',
		isMoving: false,
		files: ['/public/animations/fall-idle.vmd'],
	},
	{
		name: 'land',
		isMoving: false,
		files: ['/public/animations/land.vmd'],
	},
	{
		name: 'climbing',
		isMoving: true,
		files: ['/public/animations/climbing.vmd'],
	},
];

var blinkVmd = {
	metadata: {
		name: 'blink',
		coordinateSystem: 'right',
		morphCount: 11,
		cameraCount: 0,
		motionCount: 0,
	},
	morphs: [
		{ frameNum: 0, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 10, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 15, morphName: blinkMorphName, weight: 1.0 },
		{ frameNum: 20, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 40, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 43, morphName: blinkMorphName, weight: 1.0 },
		{ frameNum: 46, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 49, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 52, morphName: blinkMorphName, weight: 1.0 },
		{ frameNum: 55, morphName: blinkMorphName, weight: 0.0 },
		{ frameNum: 200, morphName: blinkMorphName, weight: 0.0 },
	],
	cameras: [],
	motions: [],
};

var sleepingEyesClosedVmd = {
	metadata: {
		name: 'sleeping-eyes-closed',
		coordinateSystem: 'right',
		morphCount: 2,
		cameraCount: 0,
		motionCount: 0,
	},
	morphs: [
		{ frameNum: 0, morphName: blinkMorphName, weight: 1.0 },
		{ frameNum: 30, morphName: blinkMorphName, weight: 1.0 },
	],
	cameras: [],
	motions: [],
};

var onProgress = function (xhr) {
	if (xhr.lengthComputable) {
		var percentComplete = (xhr.loaded / xhr.total) * 100;
		console.log(Math.round(percentComplete, 2) + '% downloaded');
	}
};

var onError = function (error) {
	console.error('Failed to load a character asset.', error);
	window.dispatchEvent(new CustomEvent('character-load-error', { detail: error }));
};
