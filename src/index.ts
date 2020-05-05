import { API } from 'homebridge';
import { MiAirPurifier } from './accessory';

export default function (homebridge: API) {
  homebridge.registerAccessory('homebridge-xiaomi-purifier', 'MiAirPurifier', MiAirPurifier);
}
