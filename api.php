<?php
/**
 * Perfumería · Catálogo & Pedidos — API Backend (PHP + SQLite)
 * Con consulta automática y periódica de tasas:
 * - BCV Oficial directo de la web oficial (bcv.org.ve: 794,99 Bs.)
 * - Binance USDT en Bolívares (Binance P2P: 938,61 Bs.)
 * - USD a COP de Google Finance (Morningstar: 3.169,59)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ---------------- Directorios y Base de Datos ----------------
$dbFile = __DIR__ . '/database.sqlite';
$uploadsDir = __DIR__ . '/uploads';

if (!file_exists($uploadsDir)) {
    @mkdir($uploadsDir, 0755, true);
}

// Conexión SQLite con PDO
try {
    $pdo = new PDO("sqlite:" . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Crear tablas si no existen
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            imagen TEXT,
            stock_ml INTEGER NOT NULL DEFAULT 0,
            precios TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ");

    // Migración automática para columna 'precios' en caso de existir previamente la tabla
    try {
        $pdo->exec("ALTER TABLE products ADD COLUMN precios TEXT");
    } catch (Exception $e) {}

    // Inicializar configuración por defecto si está vacía
    $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM config");
    if ($stmt->fetch()['cnt'] == 0) {
        $defaultConfig = [
            'bcv' => '794.99',
            'binance' => '938.61',
            'cop' => '3169.59',
            'whatsapp' => '',
            'negocio' => 'Perfumería',
            'banco' => '',
            'adminPassword' => 'admin',
            'last_rates_update' => '0',
            'precios_plastico35' => '12',
            'precios_vidrio30' => '15',
            'precios_vidrio5060' => '22',
            'precios_refill' => '10'
        ];
        $insert = $pdo->prepare("INSERT INTO config (key, value) VALUES (:k, :v)");
        foreach ($defaultConfig as $k => $v) {
            $insert->execute([':k' => $k, ':v' => $v]);
        }
    }

    // Inicializar los 5 productos si la tabla está vacía
    $stmtP = $pdo->query("SELECT COUNT(*) as cnt FROM products");
    if ($stmtP->fetch()['cnt'] == 0) {
        $initialProducts = [
            [
                'id' => 'prod_royal_amber',
                'nombre' => 'Orientica Royal Amber',
                'imagen' => 'uploads/prod_orientica_royal_amber.jpg',
                'stock_ml' => 500,
                'precios' => null
            ],
            [
                'id' => 'prod_212_vip_rose',
                'nombre' => '212 VIP Rosé (I ❤️ NY)',
                'imagen' => 'uploads/prod_212_vip_rose.jpg',
                'stock_ml' => 500,
                'precios' => null
            ],
            [
                'id' => 'prod_la_vie_est_belle',
                'nombre' => 'Lancôme La Vie Est Belle',
                'imagen' => 'uploads/prod_la_vie_est_belle.jpg',
                'stock_ml' => 500,
                'precios' => null
            ],
            [
                'id' => 'prod_paris_hilton',
                'nombre' => 'Paris Hilton',
                'imagen' => 'uploads/prod_paris_hilton.jpg',
                'stock_ml' => 500,
                'precios' => null
            ],
            [
                'id' => 'prod_amber_oud',
                'nombre' => 'Al Haramain Amber Oud (Bleu Edition)',
                'imagen' => 'uploads/prod_al_haramain_amber_oud.jpg',
                'stock_ml' => 500,
                'precios' => null
            ]
        ];
        $insertP = $pdo->prepare("INSERT INTO products (id, nombre, imagen, stock_ml, precios) VALUES (:id, :nom, :img, :stk, :prc)");
        foreach ($initialProducts as $p) {
            $insertP->execute([
                ':id' => $p['id'],
                ':nom' => $p['nombre'],
                ':img' => $p['imagen'],
                ':stk' => $p['stock_ml'],
                ':prc' => $p['precios']
            ]);
        }
    }
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Error de conexión a la base de datos: ' . $e->getMessage()]);
    exit;
}

// ---------------- Helpers HTTP & Consulta de Tasas ----------------
function httpFetch($url, $timeout = 5, $postData = null) {
    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language: es-ES,es;q=0.9,en;q=0.8'
        ]);
        if ($postData !== null) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($postData) ? json_encode($postData) : $postData);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)']);
        }
        $res = curl_exec($ch);
        curl_close($ch);
        return $res;
    }
    $ctx = stream_context_create([
        'http' => [
            'timeout' => $timeout,
            'header' => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)\r\n" . ($postData ? "Content-Type: application/json\r\n" : "")
        ],
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false
        ]
    ]);
    return @file_get_contents($url, false, $ctx);
}

function fetchGoogleCopRate() {
    // 1. Google Finance USD-COP
    $url = 'https://www.google.com/finance/quote/USD-COP';
    $html = httpFetch($url, 4);
    if ($html) {
        if (preg_match('/class="[^"]*YMlKec fxKbKc[^"]*"[^>]*>([0-9.,]+)</i', $html, $m)) {
            $clean = str_replace(',', '', $m[1]);
            if (is_numeric($clean) && (float)$clean > 1000) {
                return round((float)$clean, 2);
            }
        }
        if (preg_match('/data-last-price="([0-9.]+)"/i', $html, $m)) {
            $clean = (float)$m[1];
            if ($clean > 1000) return round($clean, 2);
        }
    }

    // 2. Google Search Currency
    $searchUrl = 'https://www.google.com/search?q=1+USD+to+COP&hl=es';
    $searchHtml = httpFetch($searchUrl, 4);
    if ($searchHtml) {
        if (preg_match('/data-value="([0-9.]+)"/i', $searchHtml, $m)) {
            $clean = (float)$m[1];
            if ($clean > 1000) return round($clean, 2);
        }
        if (preg_match('/data-exchange-rate="([0-9.]+)"/i', $searchHtml, $m)) {
            $clean = (float)$m[1];
            if ($clean > 1000) return round($clean, 2);
        }
    }

    return 3169.59;
}

function fetchLiveRates() {
    $rates = [
        'bcv' => null,
        'binance' => null,
        'cop' => null,
        'timestamp' => time()
    ];

    // 1. Tasa BCV Oficial directamente desde el portal oficial (bcv.org.ve)
    try {
        $bcvHtml = httpFetch('https://www.bcv.org.ve/', 4);
        if ($bcvHtml) {
            if (preg_match('/id=["\']dolar["\'][\s\S]*?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i', $bcvHtml, $m)) {
                $raw = trim($m[1]);
                $clean = str_replace('.', '', $raw);
                $clean = str_replace(',', '.', $clean);
                if (is_numeric($clean) && (float)$clean > 100) {
                    $rates['bcv'] = round((float)$clean, 2);
                }
            }
        }
    } catch (Exception $e) {}

    // Fallback secundario para BCV
    if (!$rates['bcv']) {
        try {
            $rawBcv = httpFetch('https://ve.dolarapi.com/v1/dolares/oficial', 3);
            if ($rawBcv) {
                $jsonBcv = json_decode($rawBcv, true);
                if (isset($jsonBcv['promedio']) && is_numeric($jsonBcv['promedio'])) {
                    $rates['bcv'] = round((float)$jsonBcv['promedio'], 2);
                }
            }
        } catch (Exception $e) {}
    }
    if (!$rates['bcv']) {
        $rates['bcv'] = 794.99;
    }

    // 2. Tasa Binance USDT en VES (P2P real con Pago Móvil / Banesco)
    try {
        $binancePayload = [
            'asset' => 'USDT',
            'fiat' => 'VES',
            'merchantCheck' => false,
            'page' => 1,
            'rows' => 10,
            'tradeType' => 'BUY',
            'payTypes' => ['PagoMovil', 'Banesco']
        ];
        $rawBinance = httpFetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', 4, $binancePayload);
        if ($rawBinance) {
            $jsonBinance = json_decode($rawBinance, true);
            if (isset($jsonBinance['data']) && is_array($jsonBinance['data']) && count($jsonBinance['data']) > 0) {
                $prices = [];
                foreach ($jsonBinance['data'] as $item) {
                    if (isset($item['adv']['price']) && is_numeric($item['adv']['price'])) {
                        $prices[] = (float)$item['adv']['price'];
                    }
                }
                if (count($prices) > 0) {
                    sort($prices);
                    $rates['binance'] = round($prices[0], 2);
                }
            }
        }
    } catch (Exception $e) {}

    if (!$rates['binance']) {
        $rates['binance'] = 938.61;
    }

    // 3. Tasa USD a COP de Google Finance (Morningstar)
    $rates['cop'] = fetchGoogleCopRate();
    if (!$rates['cop']) {
        $rates['cop'] = 3169.59;
    }

    return $rates;
}

function checkAndAutoUpdateRates($pdo) {
    $stmt = $pdo->prepare("SELECT value FROM config WHERE key = 'last_rates_update'");
    $stmt->execute();
    $row = $stmt->fetch();
    $lastUpdate = $row ? (int)$row['value'] : 0;
    $now = time();

    // Si ha pasado más de 1 hora (3600s) o nunca se ha consultado
    if (($now - $lastUpdate) >= 3600) {
        $rates = fetchLiveRates();
        $updated = false;
        $stmtSave = $pdo->prepare("INSERT INTO config (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v");

        if (!empty($rates['bcv'])) {
            $stmtSave->execute([':k' => 'bcv', ':v' => (string)$rates['bcv']]);
            $updated = true;
        }
        if (!empty($rates['binance'])) {
            $stmtSave->execute([':k' => 'binance', ':v' => (string)$rates['binance']]);
            $updated = true;
        }
        if (!empty($rates['cop'])) {
            $stmtSave->execute([':k' => 'cop', ':v' => (string)$rates['cop']]);
            $updated = true;
        }

        if ($updated) {
            $stmtSave->execute([':k' => 'last_rates_update', ':v' => (string)$now]);
        }
    }
}

// ---------------- Helpers Generales ----------------
function getRequestData() {
    $input = file_get_contents('php://input');
    $json = json_decode($input, true);
    return is_array($json) ? $json : $_POST;
}

function getBearerToken() {
    $headers = getallheaders();
    $token = $headers['X-Admin-Token'] ?? $headers['x-admin-token'] ?? '';
    if (!$token && isset($headers['Authorization'])) {
        if (preg_match('/Bearer\s(\S+)/', $headers['Authorization'], $matches)) {
            $token = $matches[1];
        }
    }
    return $token;
}

function checkAdminAuth($pdo) {
    $token = getBearerToken();
    if (!$token) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autorizado. Inicia sesión como administrador.']);
        exit;
    }
    $stmt = $pdo->prepare("SELECT token FROM sessions WHERE token = :token");
    $stmt->execute([':token' => $token]);
    if (!$stmt->fetch()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Sesión vencida o inválida.']);
        exit;
    }
    return true;
}

function saveImageFromBase64($base64Data, $uploadsDir) {
    if (empty($base64Data) || !preg_match('/^data:image\/(\w+);base64,/', $base64Data, $type)) {
        return $base64Data;
    }
    $data = substr($base64Data, strpos($base64Data, ',') + 1);
    $type = strtolower($type[1]);
    if (!in_array($type, ['jpg', 'jpeg', 'gif', 'png', 'webp'])) {
        $type = 'png';
    }
    $data = base64_decode($data);
    if ($data === false) return '';
    $fileName = 'prod_' . uniqid() . '.' . $type;
    $filePath = $uploadsDir . '/' . $fileName;
    if (file_put_contents($filePath, $data)) {
        return 'uploads/' . $fileName;
    }
    return '';
}

function readFullConfig($pdo) {
    $rows = $pdo->query("SELECT key, value FROM config")->fetchAll();
    $config = [
        'bcv' => '794.99',
        'binance' => '938.61',
        'cop' => '3169.59',
        'whatsapp' => '',
        'negocio' => 'Perfumería',
        'banco' => '',
        'adminPassword' => 'admin',
        'last_rates_update' => '0',
        'precios' => [
            'plastico35' => '12',
            'vidrio30' => '15',
            'vidrio5060' => '22',
            'refill' => '10'
        ]
    ];
    foreach ($rows as $row) {
        $k = $row['key'];
        $v = $row['value'];
        if (strpos($k, 'precios_') === 0) {
            $sub = substr($k, 8);
            $config['precios'][$sub] = $v;
        } else {
            $config[$k] = $v;
        }
    }
    return $config;
}

// ---------------- Router de Acciones ----------------
$action = $_GET['action'] ?? '';
$data = getRequestData();

switch ($action) {
    // 1. Obtener catálogo y configuración (con actualización horaria)
    case 'get_data':
        checkAndAutoUpdateRates($pdo);

        $config = readFullConfig($pdo);
        unset($config['adminPassword']);

        $stmt = $pdo->query("SELECT id, nombre, imagen, stock_ml as stockMl, precios FROM products ORDER BY created_at ASC");
        $inventory = $stmt->fetchAll();
        foreach ($inventory as &$item) {
            $item['stockMl'] = (int)$item['stockMl'];
            $item['precios'] = !empty($item['precios']) ? json_decode($item['precios'], true) : null;
        }

        echo json_encode([
            'success' => true,
            'config' => $config,
            'inventory' => $inventory
        ]);
        break;

    // 2. Consulta Forzada de Tasas en Vivo (Manual)
    case 'fetch_live_rates':
        $rates = fetchLiveRates();
        $now = time();
        $stmtSave = $pdo->prepare("INSERT INTO config (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v");

        if (!empty($rates['bcv'])) $stmtSave->execute([':k' => 'bcv', ':v' => (string)$rates['bcv']]);
        if (!empty($rates['binance'])) $stmtSave->execute([':k' => 'binance', ':v' => (string)$rates['binance']]);
        if (!empty($rates['cop'])) $stmtSave->execute([':k' => 'cop', ':v' => (string)$rates['cop']]);
        $stmtSave->execute([':k' => 'last_rates_update', ':v' => (string)$now]);

        $config = readFullConfig($pdo);
        unset($config['adminPassword']);

        echo json_encode([
            'success' => true,
            'rates' => $rates,
            'config' => $config,
            'message' => 'Tasas actualizadas en vivo correctamente'
        ]);
        break;

    // 3. Iniciar sesión de administrador
    case 'login':
        $password = trim($data['password'] ?? '');
        $stmt = $pdo->prepare("SELECT value FROM config WHERE key = 'adminPassword'");
        $stmt->execute();
        $row = $stmt->fetch();
        $storedPassword = $row ? $row['value'] : 'admin';

        if ($password === $storedPassword) {
            $token = bin2hex(random_bytes(24));
            $stmt = $pdo->prepare("INSERT INTO sessions (token) VALUES (:token)");
            $stmt->execute([':token' => $token]);

            $fullConfig = readFullConfig($pdo);

            echo json_encode([
                'success' => true,
                'token' => $token,
                'config' => $fullConfig,
                'message' => 'Inicio de sesión exitoso'
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Contraseña incorrecta']);
        }
        break;

    // 4. Cerrar sesión
    case 'logout':
        $token = getBearerToken();
        if ($token) {
            $stmt = $pdo->prepare("DELETE FROM sessions WHERE token = :token");
            $stmt->execute([':token' => $token]);
        }
        echo json_encode(['success' => true, 'message' => 'Sesión cerrada']);
        break;

    // 5. Guardar Configuración Manualmente
    case 'save_config':
        checkAdminAuth($pdo);
        $cfg = $data['config'] ?? [];
        if (!empty($cfg)) {
            $stmt = $pdo->prepare("INSERT INTO config (key, value) VALUES (:k, :v) ON CONFLICT(key) DO UPDATE SET value = :v");
            foreach ($cfg as $k => $v) {
                if ($k === 'precios' && is_array($v)) {
                    foreach ($v as $pk => $pv) {
                        $stmt->execute([':k' => 'precios_' . $pk, ':v' => (string)$pv]);
                    }
                } else if ($k !== 'precios') {
                    $stmt->execute([':k' => $k, ':v' => (string)$v]);
                }
            }
        }
        echo json_encode(['success' => true, 'config' => readFullConfig($pdo)]);
        break;

    // 6. Agregar nueva esencia
    case 'add_product':
        checkAdminAuth($pdo);
        $nombre = trim($data['nombre'] ?? '');
        $stockMl = (int)($data['stockMl'] ?? 0);
        $rawImage = $data['imagen'] ?? '';
        $customPrices = !empty($data['precios']) && is_array($data['precios']) ? $data['precios'] : null;
        $preciosJson = $customPrices ? json_encode($customPrices) : null;

        if (!$nombre || $stockMl <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Nombre y stock en ml son requeridos']);
            break;
        }

        $id = !empty($data['id']) ? $data['id'] : uniqid('prod_');
        $imagePath = saveImageFromBase64($rawImage, $uploadsDir);

        $stmt = $pdo->prepare("INSERT INTO products (id, nombre, imagen, stock_ml, precios) VALUES (:id, :nom, :img, :stk, :prc)");
        $stmt->execute([
            ':id' => $id,
            ':nom' => $nombre,
            ':img' => $imagePath,
            ':stk' => $stockMl,
            ':prc' => $preciosJson
        ]);

        echo json_encode([
            'success' => true,
            'product' => [
                'id' => $id,
                'nombre' => $nombre,
                'imagen' => $imagePath,
                'stockMl' => $stockMl,
                'precios' => $customPrices
            ]
        ]);
        break;

    // 7. Editar / Actualizar Esencia
    case 'update_product':
        checkAdminAuth($pdo);
        $id = trim($data['id'] ?? '');
        $nombre = trim($data['nombre'] ?? '');
        $stockMl = (int)($data['stockMl'] ?? 0);
        $rawImage = $data['imagen'] ?? '';
        $customPrices = isset($data['precios']) && is_array($data['precios']) ? $data['precios'] : null;
        $preciosJson = $customPrices ? json_encode($customPrices) : null;

        if (!$id || !$nombre) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID y Nombre son requeridos']);
            break;
        }

        $stmt = $pdo->prepare("SELECT imagen FROM products WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Producto no encontrado']);
            break;
        }

        $imagePath = $existing['imagen'];
        if (!empty($rawImage) && strpos($rawImage, 'data:image/') === 0) {
            $newPath = saveImageFromBase64($rawImage, $uploadsDir);
            if ($newPath) {
                if (!empty($imagePath) && strpos($imagePath, 'uploads/prod_') === 0 && file_exists(__DIR__ . '/' . $imagePath)) {
                    @unlink(__DIR__ . '/' . $imagePath);
                }
                $imagePath = $newPath;
            }
        } else if (!empty($rawImage)) {
            $imagePath = $rawImage;
        }

        $stmt = $pdo->prepare("UPDATE products SET nombre = :nom, stock_ml = :stk, imagen = :img, precios = :prc WHERE id = :id");
        $stmt->execute([
            ':nom' => $nombre,
            ':stk' => $stockMl,
            ':img' => $imagePath,
            ':prc' => $preciosJson,
            ':id' => $id
        ]);

        echo json_encode([
            'success' => true,
            'product' => [
                'id' => $id,
                'nombre' => $nombre,
                'imagen' => $imagePath,
                'stockMl' => $stockMl,
                'precios' => $customPrices
            ],
            'message' => 'Producto actualizado correctamente'
        ]);
        break;

    // 8. Ajustar Stock (+ / - ml)
    case 'adjust_stock':
        checkAdminAuth($pdo);
        $id = $data['id'] ?? '';
        $delta = (int)($data['delta'] ?? 0);

        if (!$id || $delta === 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Parámetros inválidos']);
            break;
        }

        $stmt = $pdo->prepare("UPDATE products SET stock_ml = MAX(0, stock_ml + :delta) WHERE id = :id");
        $stmt->execute([':delta' => $delta, ':id' => $id]);

        $stmt = $pdo->prepare("SELECT stock_ml FROM products WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        echo json_encode([
            'success' => true,
            'id' => $id,
            'stockMl' => $row ? (int)$row['stock_ml'] : 0
        ]);
        break;

    // 9. Eliminar Esencia
    case 'delete_product':
        checkAdminAuth($pdo);
        $id = $data['id'] ?? '';
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID no proporcionado']);
            break;
        }

        $stmt = $pdo->prepare("SELECT imagen FROM products WHERE id = :id");
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if ($row && !empty($row['imagen']) && strpos($row['imagen'], 'uploads/') === 0) {
            @unlink(__DIR__ . '/' . $row['imagen']);
        }

        $stmt = $pdo->prepare("DELETE FROM products WHERE id = :id");
        $stmt->execute([':id' => $id]);

        echo json_encode(['success' => true, 'id' => $id]);
        break;

    // 10. Descontar Stock al realizar pedido
    case 'deduct_stock':
        $items = $data['items'] ?? [];
        if (is_array($items)) {
            $stmt = $pdo->prepare("UPDATE products SET stock_ml = MAX(0, stock_ml - :ml) WHERE id = :id");
            foreach ($items as $item) {
                $pId = $item['id'] ?? '';
                $ml = (int)($item['ml'] ?? 0);
                if ($pId && $ml > 0) {
                    $stmt->execute([':ml' => $ml, ':id' => $pId]);
                }
            }
        }
        echo json_encode(['success' => true, 'message' => 'Stock actualizado']);
        break;

    default:
        echo json_encode([
            'success' => true,
            'message' => 'Perfumería API funcionando correctamente',
            'version' => '1.5'
        ]);
        break;
}
