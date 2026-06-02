extends Control


# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	pass # Replace with function body.


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass


func _on_btn_google_pressed() -> void:
	FirebaseAuth
	pass # Replace with function body.


func _on_btn_facebook_pressed() -> void:
	pass # Replace with function body.


func _on_btn_apple_pressed() -> void:
	pass # Replace with function body.


func _on_btn_guest_pressed() -> void:
	Auth.login_anonymous()
	pass # Replace with function body.
