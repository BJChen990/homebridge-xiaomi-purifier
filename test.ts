import { AirPurifierDevice } from './src/device';
import { MiIONetwork, MiIOClient } from 'simple-miio';

const network = new MiIONetwork();
const client = new MiIOClient(network, 'ecb3c8423694e32dc289b58e0a92a603', '192.168.8.154');
const device = new AirPurifierDevice(client);
device.status().then(console.log);
