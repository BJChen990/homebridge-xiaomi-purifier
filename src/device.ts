import { MiIOClient } from 'simple-miio';
import { zip } from 'lodash';

type On = 'on' | 'off';
type Mode = 'auto' | 'silent' | 'favorite';
export const enum PropertyKeys {
  POWER = 'power',
  AIR_QUALITY_INDEX = 'aqi',
  AVERAGE_AIR_QUALITY_INDEX = 'average_aqi',
  HUMIDITY = 'humidity',
  TEMPERATURE = 'temp_dec',
  MODE = 'mode',
  FAVORITE_ROTATION_SPEED_LEVEL = 'favorite_level',
  FILTER_LIFE_REMAINING = 'filter1_life',
  FILTER_HOURS_USED = 'f1_hour_used',
  USE_TIME = 'use_time',
  MOTOR_SPEED = 'motor1_speed',
  MOTOR_2_SPEED = 'motor2_speed',
  PURIFY_VOLUME = 'purify_volume',
  LED = 'led',
  LED_BRIGHTNESS = 'led_b',
  ILLUMINANCE = 'bright',
  BUZZER = 'buzzer',
  BUZZER_VOLUME = 'volume',
  CHILD_LOCK = 'child_lock',
  FILTER_RFID_PRODUCT_ID = 'rfid_product_id',
  FILTER_RFID_TAG_ID = 'rfid_tag',
  SLEEP_LEARNING_MODE = 'act_sleep',
  SLEEP_MODE = 'sleep_mode',
  SLEEP_TIME = 'sleep_time',
  SLEEP_LEARNING_MODE_COUNT = 'sleep_data_num',
  EXTRA_MODE_SUPPORTED = 'app_extra',
  AUTO_DETECT = 'act_det',
  LAST_BUTTON_PRESSED = 'button_pressed',
}

export type AirPurifierStatus = {
  [PropertyKeys.POWER]: On;
  [PropertyKeys.AIR_QUALITY_INDEX]: number;
  [PropertyKeys.AVERAGE_AIR_QUALITY_INDEX]: number;
  [PropertyKeys.HUMIDITY]: number;
  [PropertyKeys.TEMPERATURE]: number;
  [PropertyKeys.MODE]: Mode;
  [PropertyKeys.FAVORITE_ROTATION_SPEED_LEVEL]: number;
  [PropertyKeys.FILTER_LIFE_REMAINING]: number;
  [PropertyKeys.FILTER_HOURS_USED]: number;
  [PropertyKeys.USE_TIME]: number;
  [PropertyKeys.MOTOR_SPEED]: number;
  [PropertyKeys.MOTOR_2_SPEED]: number | null;
  [PropertyKeys.PURIFY_VOLUME]: number;
  [PropertyKeys.LED]: On;
  [PropertyKeys.LED_BRIGHTNESS]: number | null;
  [PropertyKeys.ILLUMINANCE]: number;
  [PropertyKeys.BUZZER]: On;
  [PropertyKeys.BUZZER_VOLUME]: number | null;
  [PropertyKeys.CHILD_LOCK]: On;
  [PropertyKeys.FILTER_RFID_PRODUCT_ID]: string;
  [PropertyKeys.FILTER_RFID_TAG_ID]: string;
  [PropertyKeys.SLEEP_LEARNING_MODE]: 'close' | 'single';
  [PropertyKeys.SLEEP_MODE]: 'silent' | 'poweroff' | 'idle';
  [PropertyKeys.SLEEP_TIME]: number;
  [PropertyKeys.SLEEP_LEARNING_MODE_COUNT]: number;
  [PropertyKeys.EXTRA_MODE_SUPPORTED]: number;
  [PropertyKeys.AUTO_DETECT]: null | boolean;
  [PropertyKeys.LAST_BUTTON_PRESSED]: null | string;
};

export const DEFAULT_VALUE: AirPurifierStatus = {
  [PropertyKeys.POWER]: 'off',
  [PropertyKeys.AIR_QUALITY_INDEX]: 0,
  [PropertyKeys.AVERAGE_AIR_QUALITY_INDEX]: 0,
  [PropertyKeys.HUMIDITY]: 0,
  [PropertyKeys.TEMPERATURE]: 0,
  [PropertyKeys.MODE]: 'auto',
  [PropertyKeys.FAVORITE_ROTATION_SPEED_LEVEL]: 0,
  [PropertyKeys.FILTER_LIFE_REMAINING]: 0,
  [PropertyKeys.FILTER_HOURS_USED]: 0,
  [PropertyKeys.USE_TIME]: 0,
  [PropertyKeys.MOTOR_SPEED]: 0,
  [PropertyKeys.MOTOR_2_SPEED]: 0,
  [PropertyKeys.PURIFY_VOLUME]: 0,
  [PropertyKeys.LED]: 'off',
  [PropertyKeys.LED_BRIGHTNESS]: null,
  [PropertyKeys.ILLUMINANCE]: 0,
  [PropertyKeys.BUZZER]: 'off',
  [PropertyKeys.BUZZER_VOLUME]: null,
  [PropertyKeys.CHILD_LOCK]: 'off',
  [PropertyKeys.FILTER_RFID_PRODUCT_ID]: '0:0:0:0',
  [PropertyKeys.FILTER_RFID_TAG_ID]: '00:00:00:00:00:00:0',
  [PropertyKeys.SLEEP_LEARNING_MODE]: 'close',
  [PropertyKeys.SLEEP_MODE]: 'poweroff',
  [PropertyKeys.SLEEP_TIME]: 0,
  [PropertyKeys.SLEEP_LEARNING_MODE_COUNT]: 0,
  [PropertyKeys.EXTRA_MODE_SUPPORTED]: 0,
  [PropertyKeys.AUTO_DETECT]: null,
  [PropertyKeys.LAST_BUTTON_PRESSED]: null,
};

export class AirPurifierDevice {
  constructor(private readonly client: MiIOClient) {}

  async status() {
    const propertyKeys = Object.keys(DEFAULT_VALUE);
    const chunk1 = propertyKeys.slice(0, 15);
    const chunk2 = propertyKeys.slice(15);
    // MiIO only return 16 items at a time, so we manually break here.
    const response1 = await this.client.send<string[], any[]>('get_prop', chunk1);
    const response2 = await this.client.send<string[], any>('get_prop', chunk2);
    return Object.fromEntries(
      zip(chunk1, response1.result).concat(zip(chunk2, response2.result))
    ) as AirPurifierStatus;
  }

  setPower(on: On) {
    return this.client.simpleSend('set_power', [on]);
  }

  setMode(mode: Mode) {
    return this.client.simpleSend('set_mode', [mode]);
  }

  setPhysicalLock(on: On) {
    return this.client.simpleSend('set_child_lock', [on]);
  }

  // The speed is a number from 0 ~ 17
  setFavoriteSpeedLevel(speed: number) {
    return this.client.simpleSend('set_level_favorite', [speed]);
  }

  setLED(on: On) {
    return this.client.simpleSend('set_led', [on]);
  }

  setBuzzer(on: On) {
    return this.client.simpleSend('set_buzzer', [on]);
  }
}
