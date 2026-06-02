extends Node

signal login_succeeded
signal login_failed(error_code, message)

func _ready():
	Firebase.Auth.login_succeeded.connect(_on_login_succeeded)
	Firebase.Auth.signup_succeeded.connect(_on_login_succeeded)
	Firebase.Auth.login_failed.connect(_on_login_failed)
	Firebase.Auth.signup_failed.connect(_on_login_failed)
	pass
	
func _on_login_succeeded(auth):
	Firebase.Auth.save_auth(auth)
	login_succeeded.emit()
	pass

func _on_login_failed(error_code, message):
	login_failed.emit(error_code, message)
	pass

func login_anonymous():
	var auth = Firebase.Auth.check_auth_file();
	print(auth);
	
	pass
