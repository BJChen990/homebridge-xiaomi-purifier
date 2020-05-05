import {
  CharacteristicGetCallback,
  CharacteristicValue,
  CharacteristicSetCallback,
  AccessoryPlugin,
  Logger,
  AccessoryConfig,
  API,
  Characteristic,
  CharacteristicEventTypes,
  Service,
} from 'homebridge';
import { MiIONetwork, MiIOClient } from 'simple-miio';
import { AirPurifierDevice, AirPurifierStatus, DEFAULT_VALUE, PropertyKeys } from './device';
import { debounce } from 'lodash';

const networkClient = new MiIONetwork();

const POLLING_INTERVAL = 5000;

function wait(timeout: number) {
  return new Promise(resolve => setTimeout(() => resolve(), timeout));
}

const { AirQuality, FilterLifeLevel, FilterChangeIndication } = Characteristic;

function aqiToQuality(aqi: number) {
  return aqi >= 200
    ? AirQuality.POOR
    : aqi >= 150
    ? AirQuality.INFERIOR
    : aqi >= 100
    ? AirQuality.FAIR
    : aqi >= 50
    ? AirQuality.GOOD
    : AirQuality.EXCELLENT;
}

const MIN_MOTOR_SPEED = 655;
const MAX_MOTOR_SPEED = 1605;

interface PurifierConfig extends AccessoryConfig {
  enableLED: boolean;
  enableBuzzer: boolean;
}

export class MiAirPurifier implements AccessoryPlugin {
  private readonly device: AirPurifierDevice;
  private readonly config: PurifierConfig;
  private status: AirPurifierStatus = DEFAULT_VALUE;
  public name: string;

  private filterLifeChar: Characteristic | undefined;
  private filterChangeChar: Characteristic | undefined;
  private airPurifierActiveChar: Characteristic | undefined;
  private currentPurifierStateChar: Characteristic | undefined;
  private targetPurifierStateChar: Characteristic | undefined;
  private lockChar: Characteristic | undefined;
  private rotationSpeedChar: Characteristic | undefined;
  private airQualityChar: Characteristic | undefined;
  private pm25Char: Characteristic | undefined;
  private temperatureChar: Characteristic | undefined;
  private ledChar: Characteristic | undefined;
  private humidityChar: Characteristic | undefined;
  private buzzerChar: Characteristic | undefined;
  private ambientLightChar: Characteristic | undefined;

  constructor(
    private readonly logger: Logger,
    config: AccessoryConfig,
    private readonly homebridge: API
  ) {
    this.name = config.name || 'Air Purifier';
    this.config = config as PurifierConfig;
    this.device = new AirPurifierDevice(new MiIOClient(networkClient, config.token, config.ip));
    homebridge.on('didFinishLaunching', () => {
      this.logger.debug('Start polling purifier status.');
      const intervalId = setInterval(this.updateState, POLLING_INTERVAL);
      homebridge.on('shutdown', () => {
        this.logger.debug('stop polling.');
        networkClient.close();
        clearInterval(intervalId);
      });
    });
  }

  private valueUpdater(key: PropertyKeys): (() => void)[] {
    switch (key) {
      case PropertyKeys.POWER:
        return [this.updateActiveState, this.updateCurrentAirPurifierState];
      case PropertyKeys.MODE:
        return [this.updateTargetAirPurifierState, this.updateRotationSpeed];
      case PropertyKeys.CHILD_LOCK:
        return [this.updateLockPhysicalControls];
      case PropertyKeys.MOTOR_SPEED:
        return [this.updateRotationSpeed];
      case PropertyKeys.FILTER_LIFE_REMAINING:
        return [this.updateFilterState, this.updateFilterState];
      case PropertyKeys.AIR_QUALITY_INDEX:
        return [this.updateAirQuality, this.updatePM25];
      case PropertyKeys.TEMPERATURE:
        return [this.updateTemperature];
      case PropertyKeys.HUMIDITY:
        return [this.updateHumidity];
      case PropertyKeys.LED:
        return [this.updateLockPhysicalControls];
      case PropertyKeys.BUZZER:
        return [this.updateLockPhysicalControls];
      case PropertyKeys.ILLUMINANCE:
        return [this.updateIlluminance];
    }
    return [];
  }

  updateState = async () => {
    const newState = await this.device.status();
    const itemsNeedUpdate = Object.entries(newState).reduce<(() => void)[]>(
      (updaters, [key, value]) => {
        const propertyKey = key as PropertyKeys;
        let currentUpdaters: (() => void)[] = [];
        if (this.status[propertyKey] !== value) {
          this.logger.debug('state requires update: %s -> %s', propertyKey, value);
          currentUpdaters = this.valueUpdater(propertyKey);
        }
        return [...currentUpdaters, ...updaters];
      },
      []
    );
    this.status = newState;
    itemsNeedUpdate.forEach(fn => fn());
  };

  updateActiveState = async () => {
    this.airPurifierActiveChar?.updateValue(
      this.status[PropertyKeys.POWER] === 'on'
        ? Characteristic.Active.ACTIVE
        : Characteristic.Active.INACTIVE
    );
  };

  setActiveState = async (state: CharacteristicValue, callback: CharacteristicSetCallback) => {
    this.logger.debug('setActiveState: %s', state);
    const targetState = Characteristic.Active.ACTIVE === state ? 'on' : 'off';
    if (targetState === this.status[PropertyKeys.POWER]) {
      return callback();
    }
    try {
      console.log(targetState);
      await this.device.setPower(targetState);
      callback(null);
    } catch (err) {
      this.logger.error(err);
      callback(err);
    }
  };

  updateCurrentAirPurifierState = async () => {
    this.currentPurifierStateChar?.updateValue(
      this.status[PropertyKeys.POWER] === 'on'
        ? Characteristic.CurrentAirPurifierState.PURIFYING_AIR
        : Characteristic.CurrentAirPurifierState.INACTIVE
    );
  };

  updateIlluminance = async () => {
    this.ambientLightChar?.updateValue(this.status[PropertyKeys.ILLUMINANCE]);
  };

  updateTargetAirPurifierState = async () => {
    this.targetPurifierStateChar?.updateValue(
      this.status[PropertyKeys.MODE] === 'favorite'
        ? Characteristic.TargetAirPurifierState.MANUAL
        : Characteristic.TargetAirPurifierState.AUTO
    );
  };

  setTargetAirPurifierState = async (
    state: CharacteristicValue,
    callback: CharacteristicSetCallback
  ) => {
    this.logger.debug('setTargetAirPurifierState: %s', state);
    const mode = state === Characteristic.TargetAirPurifierState.AUTO ? 'auto' : 'favorite';
    try {
      await this.device.setMode(mode);
      callback(null);
    } catch (err) {
      callback(err);
    }
  };

  updateLockPhysicalControls = async () => {
    this.lockChar?.updateValue(
      this.status[PropertyKeys.CHILD_LOCK] === 'on'
        ? Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED
        : Characteristic.LockPhysicalControls.CONTROL_LOCK_DISABLED
    );
  };

  setLockPhysicalControls = async (
    state: CharacteristicValue,
    callback: CharacteristicSetCallback
  ) => {
    try {
      this.logger.debug('setLockPhysicalControls: %s', state);
      const on = state === Characteristic.LockPhysicalControls.CONTROL_LOCK_ENABLED ? 'on' : 'off';
      await this.device.setPhysicalLock(on);
      callback();
    } catch (err) {
      callback(err);
    }
  };

  updateRotationSpeed = async () => {
    const span = MAX_MOTOR_SPEED - MIN_MOTOR_SPEED;
    this.rotationSpeedChar?.updateValue(
      ((this.status[PropertyKeys.MOTOR_SPEED] - MIN_MOTOR_SPEED) / span) * 100
    );
  };

  setRotationSpeedImpl = async (
    speed: CharacteristicValue,
    callback: CharacteristicSetCallback
  ) => {
    try {
      this.logger.debug('speed: %s', speed);
      if (this.status[PropertyKeys.MODE] !== 'favorite') {
        // Rotation speed can only be set in favorite mode
        await this.device.setMode('favorite');
        await wait(300);
      }
      // Set favorite level
      const level = Math.ceil((speed as number) / 6.25);
      this.logger.debug('setRotationSpeed: %s', level);
      await this.device.setFavoriteSpeedLevel(level);
      callback(null);
    } catch (err) {
      callback(err);
    }
  };

  setRotationSpeed = debounce(this.setRotationSpeedImpl, 100);

  updateFilterState = () => {
    this.filterLifeChar?.updateValue(this.status[PropertyKeys.FILTER_LIFE_REMAINING]);
  };

  updateFilterChangeState = () => {
    this.filterChangeChar?.updateValue(
      this.status[PropertyKeys.FILTER_LIFE_REMAINING] < 5
        ? FilterChangeIndication.CHANGE_FILTER
        : FilterChangeIndication.FILTER_OK
    );
  };

  updateAirQuality = () => {
    this.airQualityChar?.updateValue(aqiToQuality(this.status[PropertyKeys.AIR_QUALITY_INDEX]));
  };

  updatePM25 = () => {
    this.pm25Char?.updateValue(this.status[PropertyKeys.AIR_QUALITY_INDEX]);
  };

  updateTemperature = () => {
    this.temperatureChar?.updateValue(this.status[PropertyKeys.TEMPERATURE] * 0.1);
  };

  updateHumidity = () => {
    this.humidityChar?.updateValue(this.status[PropertyKeys.HUMIDITY]);
  };

  updateLED = () => {
    this.ledChar?.updateValue(this.status[PropertyKeys.LED]);
  };

  setLED = async (state: CharacteristicValue, callback: CharacteristicSetCallback) => {
    try {
      this.logger.debug('setLED: %s', state);
      await this.device.setLED(state ? 'on' : 'off');
      callback(null);
    } catch (err) {
      callback(err);
    }
  };

  updateBuzzer = async (callback: CharacteristicGetCallback) => {
    this.buzzerChar?.updateValue(this.status[PropertyKeys.BUZZER]);
  };

  setBuzzer = async (state: CharacteristicValue, callback: CharacteristicSetCallback) => {
    try {
      this.logger.debug('setBuzzer: %s', state);
      await this.device.setBuzzer(state ? 'on' : 'off');
      callback(null);
    } catch (err) {
      callback(err);
    }
  };

  getServices = () => {
    const {
      AirPurifier,
      AccessoryInformation,
      AirQualitySensor,
      Lightbulb,
      TemperatureSensor,
      HumiditySensor,
      Switch,
    } = this.homebridge.hap.Service;

    const airPurifierService = new AirPurifier(this.name);
    airPurifierService.addOptionalCharacteristic(FilterLifeLevel);
    airPurifierService.addOptionalCharacteristic(FilterChangeIndication);
    this.airPurifierActiveChar = airPurifierService
      .getCharacteristic(Characteristic.Active)
      .on(CharacteristicEventTypes.SET, this.setActiveState);
    this.currentPurifierStateChar = airPurifierService.getCharacteristic(
      Characteristic.CurrentAirPurifierState
    );
    this.targetPurifierStateChar = airPurifierService
      .getCharacteristic(Characteristic.TargetAirPurifierState)
      .on(CharacteristicEventTypes.SET, this.setTargetAirPurifierState);
    this.lockChar = airPurifierService
      .getCharacteristic(Characteristic.LockPhysicalControls)
      .on(CharacteristicEventTypes.SET, this.setLockPhysicalControls);
    this.rotationSpeedChar = airPurifierService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on(CharacteristicEventTypes.SET, this.setRotationSpeed);
    this.filterLifeChar = airPurifierService.getCharacteristic(Characteristic.FilterLifeLevel);
    this.filterChangeChar = airPurifierService.getCharacteristic(
      Characteristic.FilterChangeIndication
    );

    const infoService = new AccessoryInformation();
    infoService
      .setCharacteristic(Characteristic.Manufacturer, 'Xiaomi')
      .setCharacteristic(Characteristic.Model, 'Air Purifier');

    const airQualityService = new AirQualitySensor(`${this.name} Air Quality`);
    this.airQualityChar = airQualityService.getCharacteristic(Characteristic.AirQuality);

    this.pm25Char = airQualityService.getCharacteristic(Characteristic.PM2_5Density);

    const temperatureService = new TemperatureSensor(`${this.name} Temperature`);
    this.temperatureChar = temperatureService.getCharacteristic(Characteristic.CurrentTemperature);

    const lightSensorService = new Service.LightSensor(`${this.name} Light Sensor`);
    this.ambientLightChar = lightSensorService.getCharacteristic(
      Characteristic.CurrentAmbientLightLevel
    );

    let ledService: Service | undefined;
    if (this.config.enableLED) {
      ledService = new Lightbulb(this.name + ' LED');
      this.ledChar = ledService
        .getCharacteristic(Characteristic.On)
        .on(CharacteristicEventTypes.SET, this.setLED);
    }

    const humiditySensorService = new HumiditySensor(`${this.name} Humidity`);
    this.humidityChar = humiditySensorService.getCharacteristic(
      Characteristic.CurrentRelativeHumidity
    );

    let buzzerService: Service | undefined;
    if (this.config.enableBuzzer) {
      buzzerService = new Switch(`${this.name} Buzzer`);
      this.buzzerChar = buzzerService
        .getCharacteristic(Characteristic.On)
        .on(CharacteristicEventTypes.SET, this.setBuzzer);
    }

    return [
      airPurifierService,
      infoService,
      airQualityService,
      temperatureService,
      humiditySensorService,
      buzzerService,
      buzzerService,
      lightSensorService,
    ].filter((maybeService: Service | undefined): maybeService is Service => !!maybeService);
  };
}
