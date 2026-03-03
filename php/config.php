<?php
<?php
include 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método não permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

if ($username === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => 'Utilizador e senha são obrigatórios']);
    exit;
}

try {
    $database = new Database();
    $db = $database->getConnection();

    // Garantir tabela
    createUsersTable($db);

    $query = "SELECT id, username, password, name, role FROM users WHERE username = :username LIMIT 1";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':username', $username);
    $stmt->execute();

    if ($stmt->rowCount() !== 1) {
        echo json_encode(['success' => false, 'message' => 'Utilizador não encontrado']);
        exit;
    }

    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!password_verify($password, $user['password'])) {
        echo json_encode(['success' => false, 'message' => 'Senha incorreta']);
        exit;
    }

    // Autenticar: iniciar sessão ANTES de enviar resposta
    session_start();
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['name'] = $user['name'];
    $_SESSION['role'] = $user['role'] ?? 'user';
    $_SESSION['logged_in'] = true;

    // Não retornar password
    unset($user['password']);

    echo json_encode([
        'success' => true,
        'user' => $user,
        'message' => 'Login realizado com sucesso!'
    ]);
    exit;

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Erro no servidor: ' . $e->getMessage()]);
    exit;
}
?>