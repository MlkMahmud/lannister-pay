import { createClient } from 'redis';
import config from 'config';

export default createClient(config.get('redis.options'));
