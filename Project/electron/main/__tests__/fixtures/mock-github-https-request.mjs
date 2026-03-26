import { EventEmitter } from 'node:events';
import https from 'node:https';

const releaseAssets = JSON.parse(process.env.MOCK_RELEASE_ASSETS_JSON || '[]');

https.request = (options, callback) => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.statusMessage = 'OK';

    const request = new EventEmitter();
    request.end = () => {
        queueMicrotask(() => {
            callback(response);
            response.emit(
                'data',
                Buffer.from(
                    JSON.stringify({
                        assets: releaseAssets.map((name) => ({ name })),
                    })
                )
            );
            response.emit('end');
        });
    };

    request.destroy = () => {};

    return request;
};
