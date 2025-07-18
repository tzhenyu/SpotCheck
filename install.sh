#!/bin/sh

# This script sets up Git, clones the official repository from github, and installs Google Chrome on a Debian-based system.
# Compatible with sh for curl -fsSL | sh execution

# Set minimum Python version requirement
PYTHON_MIN_VERSION="3.12"
PYTHON_VENV_PACKAGE="python${PYTHON_MIN_VERSION}-venv"
PYTHON_DEV_PACKAGE="python${PYTHON_MIN_VERSION}-dev"
PYTHON_FULL_PACKAGE="python${PYTHON_MIN_VERSION}"

# Function to check if the required Python version is available
check_python_version() {
    if command -v "$PYTHON_FULL_PACKAGE" >/dev/null 2>&1; then
        return 0  # Required Python version is available
    else
        return 1  # Required Python version is not available
    fi
}

# Updates apt on Debian-based Distros
echo "Updating system packages..."
sudo apt-get update > /dev/null 2>&1
sudo apt-get upgrade -y -q > /dev/null 2>&1

# Clear the terminal for better readability
echo "System packages updated."

# Function to check if a package is installed
check_package_installed() {
    if dpkg -s "$1" >/dev/null 2>&1; then
        return 0  # Package is installed
    else
        return 1  # Package is not installed
    fi
}

# Install Git
echo ""
echo ""
echo ""
echo "Checking if Git is already installed..."
if check_package_installed "git"; then
    echo ""
    echo "Git is already installed."
else
    echo ""
    echo "Installing Git..."
    sudo apt-get install -y git
fi

# Check Python version and install latest stable if needed
echo ""
echo ""
echo ""
echo "Checking Python installation..."
if check_python_version; then
    PYTHON_VERSION=$($PYTHON_FULL_PACKAGE --version | awk '{print $2}')
    echo "Required Python version $PYTHON_VERSION is installed."
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    echo "Python version $PYTHON_VERSION is installed, but we need version $PYTHON_MIN_VERSION or newer."
    # Compare version with minimum required
    MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
    MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
    MIN_MAJOR=$(echo "$PYTHON_MIN_VERSION" | cut -d. -f1)
    MIN_MINOR=$(echo "$PYTHON_MIN_VERSION" | cut -d. -f2)
    if [ "$MAJOR" -lt "$MIN_MAJOR" ] || { [ "$MAJOR" -eq "$MIN_MAJOR" ] && [ "$MINOR" -lt "$MIN_MINOR" ]; }; then
        echo "Python version is older than recommended. Would you like to install the latest stable version? (y/n)"
        # POSIX-compliant input handling for curl | sh scenarios
        INSTALL_PYTHON=""
        if [ -t 0 ]; then
            # Terminal is interactive - not all sh versions support -t flag for read
            printf "" >/dev/null 2>&1
            if command -v read >/dev/null 2>&1; then
                read INSTALL_PYTHON || true
            fi
        else
            # Try reading from /dev/tty if available
            if [ -e "/dev/tty" ]; then
                # Some sh implementations might not support input redirection with read
                if command -v read >/dev/null 2>&1; then
                    read INSTALL_PYTHON </dev/tty || true
                fi
            fi
        fi
        
        if [ -z "$INSTALL_PYTHON" ]; then
            echo "No input received, defaulting to no."
            INSTALL_PYTHON="n"
        fi
        
        if [ "$INSTALL_PYTHON" = "y" ] || [ "$INSTALL_PYTHON" = "Y" ]; then
            echo "Installing Python $PYTHON_MIN_VERSION..."
            sudo apt-get install -y software-properties-common
            sudo add-apt-repository -y ppa:deadsnakes/ppa
            sudo apt-get update
            sudo apt-get install -y "$PYTHON_FULL_PACKAGE" "$PYTHON_VENV_PACKAGE" "$PYTHON_DEV_PACKAGE" python3-pip
            echo "Python $PYTHON_MIN_VERSION has been installed!"
        else
            echo "Continuing with existing Python version."
        fi
    fi
else
    echo "Python is not installed. Would you like to install the latest stable version? (y/n)"
    # POSIX-compliant input handling for curl | sh scenarios
    INSTALL_PYTHON=""
    if [ -t 0 ]; then
        # Terminal is interactive - not all sh versions support -t flag for read
        printf "" >/dev/null 2>&1
        if command -v read >/dev/null 2>&1; then
            read INSTALL_PYTHON || true
        fi
    else
        # Try reading from /dev/tty if available
        if [ -e "/dev/tty" ]; then
            # Some sh implementations might not support input redirection with read
            if command -v read >/dev/null 2>&1; then
                read INSTALL_PYTHON </dev/tty || true
            fi
        fi
    fi
    
    # Add default value if no input is provided
    if [ -z "$INSTALL_PYTHON" ]; then
        echo "No input received, defaulting to no."
        INSTALL_PYTHON="n"
    fi
    
    if [ "$INSTALL_PYTHON" = "y" ] || [ "$INSTALL_PYTHON" = "Y" ]; then
        echo "Installing Python $PYTHON_MIN_VERSION..."
        sudo apt-get install -y software-properties-common
        sudo add-apt-repository -y ppa:deadsnakes/ppa
        sudo apt-get update
        sudo apt-get install -y "$PYTHON_FULL_PACKAGE" "$PYTHON_VENV_PACKAGE" "$PYTHON_DEV_PACKAGE" python3-pip
        echo "Python $PYTHON_MIN_VERSION has been installed!"
    else
        echo "Skipping Python installation."
    fi
fi

# Git repository setup
# Using the specified repository URL
REPO_URL="https://github.com/tzhenyu/SpotCheck.git"
echo ""
echo "Working with repository: $REPO_URL"
echo "Checking if the repository already exists..."
# Set the clone directory to /home/SpotCheck
CLONE_DIR="/home/SpotCheck"

# Create directory if it doesn't exist
sudo mkdir -p "$CLONE_DIR"

# Set proper permissions for the directory
sudo chown $USER:$USER "$CLONE_DIR"

# Check if the repository already exists
if [ -d "$CLONE_DIR/.git" ]; then
    echo "Repository already exists, updating with git pull..."
    # Change to the repository directory
    cd "$CLONE_DIR"
    # Update the repository
    if git pull; then
        echo "Repository successfully updated"
    else
        echo "Failed to update repository. Please check your network connection and try again."
        exit 1
    fi
else
    # Clone the repository if it doesn't exist
    echo "Cloning repository: $REPO_URL"
    if git clone "$REPO_URL" "$CLONE_DIR"; then
        echo "Repository successfully cloned to $CLONE_DIR"
    else
        echo "Failed to clone repository. Please check the URL and try again."
        exit 1
    fi
fi

# Install Google Chrome using Google's official repository
echo ""
echo "Installing Google Chrome using Google's official repository..."

# Add Google Chrome repository automatically
echo "deb [arch=amd64] https://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list > /dev/null

# Add Google's signing key (modern approach) if it doesn't already exist
if [ ! -f "/etc/apt/trusted.gpg.d/google-chrome.gpg" ]; then
    wget -qO- https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/google-chrome.gpg > /dev/null 2>&1
    echo "Added Google Chrome signing key."
    # Update package list with added signing key
    echo "Updating package list with added signing key..."
    sudo apt-get update > /dev/null 2>&1
else
    echo "Google Chrome signing key already exists."
fi

# Install Google Chrome
echo ""
if check_package_installed "google-chrome-stable"; then
    echo "Google Chrome is already installed."
else
    # Prompt user before installing
    echo ""
    echo "Google Chrome is not installed. Would you like to install it? (y/n): "
    # POSIX-compliant input handling for curl | sh scenarios
    INSTALL_CHROME=""
    if [ -t 0 ]; then
        # Terminal is interactive - not all sh versions support -t flag for read
        printf "" >/dev/null 2>&1
        if command -v read >/dev/null 2>&1; then
            read INSTALL_CHROME || true
        fi
    else
        # Try reading from /dev/tty if available
        if [ -e "/dev/tty" ]; then
            # Some sh implementations might not support input redirection with read
            if command -v read >/dev/null 2>&1; then
                read INSTALL_CHROME </dev/tty || true
            fi
        fi
    fi
    
    # Add default value if no input is provided
    if [ -z "$INSTALL_CHROME" ]; then
        echo "No input received, defaulting to no."
        INSTALL_CHROME="n"
    fi
    
    # Check for installation confirmation
    if [ "$INSTALL_CHROME" = "y" ] || [ "$INSTALL_CHROME" = "Y" ]; then
        echo "Installing Google Chrome..."
        if sudo apt-get install -y google-chrome-stable; then
            echo "Google Chrome has been successfully installed!"
        else
            echo "Failed to install Google Chrome."
            exit 1
        fi
    else
        echo "Skipping Google Chrome installation."
    fi
fi

# Clear the screen for better readability
# clear

# Run the Python backend script
echo ""
echo "Starting Python backend script..."
BACKEND_SCRIPT="$CLONE_DIR/backend/backend.py"

# Check if the backend script exists
if [ -f "$BACKEND_SCRIPT" ]; then
    echo "Found backend script at $BACKEND_SCRIPT"
    # Check for Python executable
    if command -v python3 >/dev/null 2>&1; then
        # Check if pip is installed and install if missing
        if ! python3 -c "import pip" >/dev/null 2>&1; then
            echo "pip not found. Installing pip..."
            if command -v apt-get >/dev/null 2>&1; then
                # Debian/Ubuntu systems
                sudo apt-get update
                sudo apt-get install -y python3-pip "$PYTHON_VENV_PACKAGE"
                echo "Installed python3-pip and $PYTHON_VENV_PACKAGE packages"
            elif command -v dnf >/dev/null 2>&1; then
                # Fedora/RHEL/CentOS
                sudo dnf install -y python3-pip
            elif command -v yum >/dev/null 2>&1; then
                # Older RHEL/CentOS
                sudo yum install -y python3-pip
            elif command -v apk >/dev/null 2>&1; then
                # Alpine
                sudo apk add py3-pip
            elif command -v pacman >/dev/null 2>&1; then
                # Arch
                sudo pacman -S --noconfirm python-pip
            else
                echo "Could not install pip. Package manager not found."
                echo "Please install pip manually and run the script again."
            fi
        fi

        # Create a Python virtual environment outside of the git repo to avoid conflicts
        VENV_DIR="/home/SpotCheck/venv"
        echo "Creating Python virtual environment at $VENV_DIR (outside git repo)..."
        
        # Make sure we have all necessary packages for venv creation
        VENV_DEPS_INSTALLED=false
        VENV_STATUS=""
        
        # Check if venv module is available
        if ! python3 -c "import venv" >/dev/null 2>&1; then
            echo "Python venv module not found. Installing dependencies..."
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get update
                sudo apt-get install -y python3-venv python3-dev "$PYTHON_VENV_PACKAGE"
                echo "Installed python3-venv, python3-dev, and $PYTHON_VENV_PACKAGE packages"
                VENV_DEPS_INSTALLED=true
            elif command -v dnf >/dev/null 2>&1; then
                sudo dnf install -y python3-venv python3-devel
                VENV_DEPS_INSTALLED=true
            elif command -v yum >/dev/null 2>&1; then
                sudo yum install -y python3-venv python3-devel
                VENV_DEPS_INSTALLED=true
            elif command -v apk >/dev/null 2>&1; then
                sudo apk add python3-venv python3-dev
                VENV_DEPS_INSTALLED=true
            elif command -v pacman >/dev/null 2>&1; then
                sudo pacman -S --noconfirm python-virtualenv
                VENV_DEPS_INSTALLED=true
            else
                echo "Could not install venv. Package manager not found."
                VENV_STATUS="not_available"
            fi
            
            # Verify installation was successful
            if [ "$VENV_DEPS_INSTALLED" = true ]; then
                echo "Checking if venv is now available..."
                if python3 -c "import venv" >/dev/null 2>&1; then
                    echo "venv module successfully installed."
                else
                    echo "venv module installation failed. Will try to continue."
                fi
            fi
        fi
        
        # Create directory with proper permissions first
        sudo mkdir -p "$VENV_DIR"
        sudo chown $USER:$USER "$VENV_DIR"
        
        # Try creating the virtual environment if venv is available
        # First check if our preferred Python version has venv
        PYTHON_CMD="python3"
        if check_python_version && $PYTHON_FULL_PACKAGE -c "import venv" >/dev/null 2>&1; then
            echo "Attempting to create virtual environment with $PYTHON_FULL_PACKAGE..."
            PYTHON_CMD="$PYTHON_FULL_PACKAGE"
        elif python3 -c "import venv" >/dev/null 2>&1; then
            echo "Attempting to create virtual environment with python3..."
        else
            echo "Python venv module not available."
            VENV_STATUS="not_available"
            # Skip virtual environment creation
        fi
        
        if [ -n "$VENV_STATUS" ] && [ "$VENV_STATUS" = "not_available" ]; then
            echo "Skipping virtual environment creation."
        elif $PYTHON_CMD -m venv "$VENV_DIR"; then
            echo "Virtual environment created successfully."
            # Source the virtual environment
            . "$VENV_DIR/bin/activate"
            VENV_STATUS="activated"
            echo "Virtual environment activated."
        
            # Check if pip is available in the virtual environment
            if ! $PYTHON_CMD -c "import pip" >/dev/null 2>&1; then
                echo "Installing pip in virtual environment..."
                if $PYTHON_CMD -m ensurepip --upgrade; then
                    echo "pip installed successfully using ensurepip."
                else
                    echo "ensurepip not available, trying alternative method..."
                    if curl -s https://bootstrap.pypa.io/get-pip.py | $PYTHON_CMD; then
                        echo "pip installed successfully using get-pip.py."
                    else
                        echo "Failed to install pip in virtual environment."
                    fi
                fi
            fi
        else
            echo "Failed to create virtual environment. Will try installing additional dependencies."
            # Try installing additional dependencies that might be needed
            if command -v apt-get >/dev/null 2>&1; then
                sudo apt-get install -y python3-dev python3-setuptools python3-wheel "$PYTHON_VENV_PACKAGE"
                echo "Installed additional dependencies including $PYTHON_VENV_PACKAGE"
                # Try again after installing additional dependencies
                if python3 -m venv "$VENV_DIR"; then
                    echo "Virtual environment created successfully on second attempt."
                    # Source the virtual environment
                    . "$VENV_DIR/bin/activate"
                    VENV_STATUS="activated"
                    echo "Virtual environment activated."
                else
                    echo "Failed to create virtual environment after installing additional dependencies."
                    VENV_STATUS="failed"
                fi
            else
                VENV_STATUS="failed"
                echo "Failed to create virtual environment. Continuing with system Python."
            fi
        fi

        # Install required Python packages if requirements.txt exists
        REQUIREMENTS_FILE="$CLONE_DIR/backend/requirements.txt"
        if [ -f "$REQUIREMENTS_FILE" ]; then
            echo "Installing Python dependencies from requirements.txt..."
            # Check if pip is now installed
            if $PYTHON_CMD -c "import pip" >/dev/null 2>&1; then
                if $PYTHON_CMD -m pip install -r "$REQUIREMENTS_FILE"; then
                    echo "Dependencies successfully installed."
                else
                    echo "Failed to install dependencies using pip. Will try alternative methods."
                    # Try to install pip if missing
                    if curl -s https://bootstrap.pypa.io/get-pip.py | $PYTHON_CMD; then
                        echo "pip installed using get-pip.py, trying to install dependencies again..."
                        if $PYTHON_CMD -m pip install -r "$REQUIREMENTS_FILE"; then
                            echo "Dependencies successfully installed on second attempt."
                        else
                            echo "Failed to install dependencies. Backend script may not run correctly."
                        fi
                    fi
                fi
            else
                # Try to install pip first
                echo "pip not found. Attempting to install pip..."
                if curl -s https://bootstrap.pypa.io/get-pip.py | $PYTHON_CMD; then
                    echo "pip installed, now installing dependencies..."
                    if $PYTHON_CMD -m pip install -r "$REQUIREMENTS_FILE"; then
                        echo "Dependencies successfully installed."
                    else
                        echo "Failed to install dependencies. Backend script may not run correctly."
                    fi
                else
                    # Alternative method using easy_install if available
                    if command -v easy_install >/dev/null 2>&1; then
                        echo "Using easy_install as fallback..."
                        sudo easy_install -f "$REQUIREMENTS_FILE"
                        echo "Dependencies installation attempted with easy_install."
                    else
                        echo "No package installer found. Cannot install dependencies."
                    fi
                fi
            fi
        else
            echo "No requirements.txt file found. Skipping dependency installation."
        fi
        
        echo "Starting backend.py with python3..."
        # Run the script in the background
        cd "$CLONE_DIR/backend"
        
        # Check if we should try to use the specific Python version
        PYTHON_CMD="python3"
        if command -v "$PYTHON_FULL_PACKAGE" >/dev/null 2>&1; then
            echo "Using $PYTHON_FULL_PACKAGE for backend execution"
            PYTHON_CMD="$PYTHON_FULL_PACKAGE"
        fi
        
        # Check if backend.py is already running
        if pgrep -f "python.*backend.py" >/dev/null 2>&1; then
            echo "Backend script is already running. Killing existing process to restart with updated code."
            OLD_BACKEND_PID=$(pgrep -f "python.*backend.py" | head -n 1)
            # Kill the existing process
            kill -9 $OLD_BACKEND_PID >/dev/null 2>&1
            sleep 2
            # Verify it's been killed
            if ps -p $OLD_BACKEND_PID >/dev/null 2>&1; then
                echo "Warning: Failed to kill existing backend process. New process may not start properly."
            else
                echo "Successfully killed existing backend process (PID: $OLD_BACKEND_PID)."
            fi
            BACKEND_STATUS="restarting"
        fi
            
        # Use nohup to keep script running even if terminal closes
        # Redirect both stdout and stderr to a log file
        echo "Starting backend script with $PYTHON_CMD..."
        nohup $PYTHON_CMD backend.py > "$CLONE_DIR/backend/backend.log" 2>&1 &
        BACKEND_PID=$!
        
        # Brief pause to check if process is still running (didn't fail immediately)
        sleep 2
        if ps -p $BACKEND_PID >/dev/null 2>&1; then
            if [ "$BACKEND_STATUS" = "restarting" ]; then
                echo "Backend script has been restarted with updated code. New PID: $BACKEND_PID"
            else
                echo "Backend script is running with PID: $BACKEND_PID"
            fi
            BACKEND_STATUS="running"
        else
            echo "Backend script failed to start. Check backend.log for details."
            BACKEND_STATUS="failed"
        fi
    else
        echo "Python3 is not installed. Cannot run backend script."
        BACKEND_STATUS="not_started"
    fi
else
    echo "Backend script not found at $BACKEND_SCRIPT"
    BACKEND_STATUS="not_found"
fi


# Install Ollama
echo ""
echo "Setting up Ollama and LLM model..."
OLLAMA_STATUS="not_attempted"

# Check if Ollama is already installed
if command -v ollama >/dev/null 2>&1; then
    echo "Ollama is already installed."
    OLLAMA_STATUS="already_installed"
else
    echo "Installing Ollama..."
    # Prompt user before installing
    echo "Would you like to install Ollama for LLM capabilities? (y/n): "
    INSTALL_OLLAMA=""
    if [ -t 0 ]; then
        # Terminal is interactive
        read INSTALL_OLLAMA || true
    else
        # Try reading from /dev/tty if available
        if [ -e "/dev/tty" ]; then
            read INSTALL_OLLAMA </dev/tty || true
        fi
    fi
    
    # Add default value if no input is provided
    if [ -z "$INSTALL_OLLAMA" ]; then
        echo "No input received, defaulting to no."
        INSTALL_OLLAMA="n"
    fi
    
    # Check for installation confirmation
    if [ "$INSTALL_OLLAMA" = "y" ] || [ "$INSTALL_OLLAMA" = "Y" ]; then
        echo "Installing Ollama using official installer..."
        if curl -fsSL https://ollama.com/install.sh | sh; then
            echo "Ollama has been successfully installed!"
            OLLAMA_STATUS="installed"
            
            # Install llama3:instruct model
            echo ""
            echo "Would you like to install the llama3:instruct model? (y/n): "
            echo "Note: This may take several minutes depending on your internet speed."
            INSTALL_MODEL=""
            if [ -t 0 ]; then
                read INSTALL_MODEL || true
            else
                if [ -e "/dev/tty" ]; then
                    read INSTALL_MODEL </dev/tty || true
                fi
            fi
            
            if [ -z "$INSTALL_MODEL" ]; then
                echo "No input received, defaulting to no."
                INSTALL_MODEL="n"
            fi
            
            if [ "$INSTALL_MODEL" = "y" ] || [ "$INSTALL_MODEL" = "Y" ]; then
                echo "Installing llama3:instruct model. Please be patient..."
                if ollama run llama3:instruct "Say hi, then exit" > /dev/null; then
                    echo "llama3:instruct model has been successfully installed!"
                    OLLAMA_STATUS="model_installed"
                else
                    echo "Failed to install llama3:instruct model."
                    OLLAMA_STATUS="model_failed"
                fi
            else
                echo "Skipping llama3:instruct model installation."
            fi
        else
            echo "Failed to install Ollama."
            OLLAMA_STATUS="failed"
        fi
    else
        echo "Skipping Ollama installation."
        OLLAMA_STATUS="skipped"
    fi
fi

# Display summary of actions
echo "======================= INSTALLATION SUMMARY ======================="
echo ""

# Git summary
if check_package_installed "git"; then
    echo "✅ Git is installed"
else
    echo "❌ Git installation was skipped or failed"
fi

# Python summary
if command -v python3 >/dev/null 2>&1; then
    CURRENT_PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    echo "✅ Python $CURRENT_PYTHON_VERSION is installed"
else
    echo "❌ Python installation was skipped or failed"
fi

# Repository summary
if [ -d "$CLONE_DIR/.git" ]; then
    echo "✅ Repository was successfully cloned or updated at: $CLONE_DIR"
else
    echo "❌ Repository setup failed"
fi

# Chrome summary
if check_package_installed "google-chrome-stable"; then
    echo "✅ Google Chrome is installed"
else
    # Check if installation was skipped (INSTALL_CHROME wasn't "y" or "Y")
    if [ -n "$INSTALL_CHROME" ] && [ "$INSTALL_CHROME" != "y" ] && [ "$INSTALL_CHROME" != "Y" ]; then
        echo "✅ Google Chrome installation was skipped as requested"
    else
        echo "❌ Google Chrome installation failed"
    fi
fi

# Virtual environment summary
if [ "$VENV_STATUS" = "activated" ]; then
    echo "✅ Python virtual environment created and activated at: $VENV_DIR"
elif [ "$VENV_STATUS" = "failed" ]; then
    echo "⚠️ Failed to create virtual environment, using system Python"
fi

# Backend script summary
if [ "$BACKEND_STATUS" = "running" ]; then
    if [ -n "$OLD_BACKEND_PID" ]; then
        echo "✅ Python backend script was restarted with updated code. New PID: $BACKEND_PID"
        echo "   Previous instance (PID: $OLD_BACKEND_PID) was terminated"
    else
        echo "✅ Python backend script is running with PID: $BACKEND_PID"
    fi
    echo "   Check log file at: $CLONE_DIR/backend/backend.log"
elif [ "$BACKEND_STATUS" = "failed" ]; then
    echo "❌ Python backend script failed to start. Check backend.log for details."
elif [ "$BACKEND_STATUS" = "not_started" ]; then
    echo "❌ Python backend script could not be started (Python not installed)"
elif [ "$BACKEND_STATUS" = "not_found" ]; then
    echo "❌ Python backend script not found at $BACKEND_SCRIPT"
else
    echo "ℹ️ Python backend script status: $BACKEND_STATUS"
fi


# Ollama summary
if [ "$OLLAMA_STATUS" = "model_installed" ]; then
    echo "✅ Ollama is installed with llama3:instruct model"
    echo "   You can use it with: ollama run llama3:instruct \"Your prompt here\""
elif [ "$OLLAMA_STATUS" = "installed" ]; then
    echo "✅ Ollama is installed (without llama3:instruct model)"
    echo "   You can install models using: ollama pull modelname"
elif [ "$OLLAMA_STATUS" = "already_installed" ]; then
    echo "✅ Ollama was already installed"
elif [ "$OLLAMA_STATUS" = "model_failed" ]; then
    echo "⚠️ Ollama is installed but llama3:instruct model installation failed"
    echo "   You can try again with: ollama pull llama3:instruct"
elif [ "$OLLAMA_STATUS" = "failed" ]; then
    echo "❌ Ollama installation failed"
elif [ "$OLLAMA_STATUS" = "skipped" ]; then
    echo "✅ Ollama installation was skipped as requested"
else
    echo "ℹ️ Ollama installation was not attempted"
fi

echo ""
echo "=================================================================="
echo "Setup script finished!"
echo "=================================================================="