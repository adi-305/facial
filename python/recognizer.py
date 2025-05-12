import face_recognition
import sys
import numpy as np
import json

def recognize_face(image_path):
    # Load the image file
    image = face_recognition.load_image_file(image_path)

    # Find all face locations
    face_locations = face_recognition.face_locations(image)

    if len(face_locations) > 0:
        # Encode the first face
        face_encoding = face_recognition.face_encodings(image, [face_locations[0]])[0]
        # Convert numpy array to list for JSON serialization
        return face_encoding.tolist()
    else:
        return None

if __name__ == "__main__":
    image_path = sys.argv[1]
    encoding = recognize_face(image_path)
    if encoding:
        print('success')
        print(json.dumps(encoding))  # Output as JSON string
    else:
        print('fail')
